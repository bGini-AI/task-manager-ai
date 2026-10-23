import { query, pool, ensureSchema } from "./db";
import type { Priority, Status, ViewType } from "./constants";
import type { Space, Task } from "./types";

const TASK_COLS = `id, space_id, title, description, priority, status, due_date,
  completed_at, position, created_at, updated_at`;

/* ----------------------------- spaces ----------------------------- */

export async function listSpaces(): Promise<Space[]> {
  return query<Space>(
    `SELECT id, name, color, view, position FROM tm_spaces ORDER BY position, created_at`,
  );
}

export async function createSpace(input: {
  name: string;
  color: string;
  view: ViewType;
}): Promise<Space> {
  const rows = await query<Space>(
    `INSERT INTO tm_spaces (name, color, view, position)
     VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) FROM tm_spaces), 0) + 1)
     RETURNING id, name, color, view, position`,
    [input.name, input.color, input.view],
  );
  return rows[0];
}

export async function updateSpace(
  id: string,
  patch: Partial<{ name: string; color: string; view: ViewType }>,
): Promise<Space | null> {
  const rows = await query<Space>(
    `UPDATE tm_spaces SET
       name = COALESCE($2, name),
       color = COALESCE($3, color),
       view = COALESCE($4, view)
     WHERE id = $1
     RETURNING id, name, color, view, position`,
    [id, patch.name ?? null, patch.color ?? null, patch.view ?? null],
  );
  return rows[0] ?? null;
}

export async function deleteSpace(id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM tm_spaces WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

/* ------------------------------ tasks ------------------------------ */

export interface TaskFilter {
  ids?: string[];
  spaceIds?: string[];
  status?: Status[];
  priority?: Priority[];
  overdue?: boolean;
  dueOn?: string;
  dueFrom?: string;
  dueTo?: string;
  hasDueDate?: boolean;
  search?: string;
  limit?: number;
}

export async function listTasks(filter: TaskFilter = {}, today = ""): Promise<Task[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (filter.ids) where.push(`id = ANY(${p(filter.ids)}::uuid[])`);
  if (filter.spaceIds) where.push(`space_id = ANY(${p(filter.spaceIds)}::uuid[])`);
  if (filter.status?.length) where.push(`status = ANY(${p(filter.status)})`);
  if (filter.priority?.length) where.push(`priority = ANY(${p(filter.priority)})`);
  if (filter.overdue) where.push(`(due_date < ${p(today)}::date AND status <> 'done')`);
  if (filter.dueOn) where.push(`due_date = ${p(filter.dueOn)}::date`);
  if (filter.dueFrom) where.push(`due_date >= ${p(filter.dueFrom)}::date`);
  if (filter.dueTo) where.push(`due_date <= ${p(filter.dueTo)}::date`);
  if (filter.hasDueDate === true) where.push(`due_date IS NOT NULL`);
  if (filter.hasDueDate === false) where.push(`due_date IS NULL`);
  if (filter.search) {
    const q = p(`%${filter.search}%`);
    where.push(`(title ILIKE ${q} OR description ILIKE ${q})`);
  }
  const limit = filter.limit ? `LIMIT ${Math.min(Math.max(1, filter.limit), 500)}` : "";
  return query<Task>(
    `SELECT ${TASK_COLS} FROM tm_tasks
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY space_id, position, created_at ${limit}`,
    params,
  );
}

export async function getTask(id: string): Promise<Task | null> {
  const rows = await query<Task>(`SELECT ${TASK_COLS} FROM tm_tasks WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export interface NewTask {
  space_id: string;
  title: string;
  description?: string;
  priority?: Priority;
  status?: Status;
  due_date?: string | null;
  position?: number;
}

export async function createTask(input: NewTask): Promise<Task> {
  const status = input.status ?? "new";
  const rows = await query<Task>(
    `INSERT INTO tm_tasks (space_id, title, description, priority, status, due_date,
        completed_at, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
        COALESCE($8, (SELECT COALESCE(MAX(position), 0) + 1 FROM tm_tasks WHERE space_id = $1)))
     RETURNING ${TASK_COLS}`,
    [
      input.space_id,
      input.title,
      input.description ?? "",
      input.priority ?? "medium",
      status,
      input.due_date ?? null,
      status === "done" ? new Date().toISOString() : null,
      input.position ?? null,
    ],
  );
  return rows[0];
}

export interface TaskPatch {
  space_id?: string;
  title?: string;
  description?: string;
  priority?: Priority;
  status?: Status;
  due_date?: string | null;
  position?: number;
}

export async function updateTask(id: string, patch: TaskPatch): Promise<Task | null> {
  const existing = await getTask(id);
  if (!existing) return null;
  const next = { ...existing, ...patch } as Task;
  let completed_at = existing.completed_at;
  if (patch.status && patch.status !== existing.status) {
    completed_at = patch.status === "done" ? new Date().toISOString() : null;
  }
  const rows = await query<Task>(
    `UPDATE tm_tasks SET space_id=$2, title=$3, description=$4, priority=$5, status=$6,
       due_date=$7, completed_at=$8, position=$9, updated_at=now()
     WHERE id=$1 RETURNING ${TASK_COLS}`,
    [
      id,
      next.space_id,
      next.title,
      next.description,
      next.priority,
      next.status,
      next.due_date,
      completed_at,
      next.position,
    ],
  );
  return rows[0] ?? null;
}

export async function deleteTask(id: string): Promise<boolean> {
  const rows = await query(`DELETE FROM tm_tasks WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

export async function deleteTasks(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await query(`DELETE FROM tm_tasks WHERE id = ANY($1::uuid[]) RETURNING id`, [ids]);
  return rows.length;
}

export async function createTasks(inputs: NewTask[]): Promise<Task[]> {
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out: Task[] = [];
    for (const input of inputs) {
      const status = input.status ?? "new";
      const res = await client.query(
        `INSERT INTO tm_tasks (space_id, title, description, priority, status, due_date,
            completed_at, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
            (SELECT COALESCE(MAX(position), 0) + 1 FROM tm_tasks WHERE space_id = $1))
         RETURNING ${TASK_COLS}`,
        [
          input.space_id,
          input.title,
          input.description ?? "",
          input.priority ?? "medium",
          status,
          input.due_date ?? null,
          status === "done" ? new Date().toISOString() : null,
        ],
      );
      out.push(res.rows[0]);
    }
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/* ----------------------------- settings ----------------------------- */

export async function getSetting<T>(key: string): Promise<T | null> {
  const rows = await query<{ value: T }>(`SELECT value FROM tm_settings WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await query(
    `INSERT INTO tm_settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}
