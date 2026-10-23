import { z } from "zod";
import { PRIORITIES, PRIORITY_META, STATUSES, STATUS_META, type Priority, type Status } from "./constants";
import { addDays, longDate, shortDate, todayStr, weekStartInstant } from "./dates";
import { query } from "./db";
import {
  createTasks,
  deleteTasks,
  listSpaces,
  listTasks,
  updateTask,
  type TaskFilter,
} from "./tasks";
import type { PendingAction, Scope, Space, Task } from "./types";

/* ---------------------------------------------------------------------- */
/* Tool definitions (the agent's 5 tools)                                  */
/* ---------------------------------------------------------------------- */

const filterProps = {
  space: { type: "string", description: "שם או מזהה של מרחב (חייב להיות בתוך הבחירה הנוכחית). אם לא צוין - כל המרחבים שנבחרו." },
  status: { type: "array", items: { type: "string", enum: [...STATUSES] }, description: "סינון לפי סטטוס" },
  priority: { type: "array", items: { type: "string", enum: [...PRIORITIES] }, description: "סינון לפי עדיפות" },
  overdue: { type: "boolean", description: "true = רק משימות באיחור (תאריך יעד עבר ולא הושלמו)" },
  due_on: { type: "string", description: "תאריך יעד מדויק YYYY-MM-DD" },
  due_from: { type: "string", description: "תאריך יעד מ- (כולל) YYYY-MM-DD" },
  due_to: { type: "string", description: "תאריך יעד עד (כולל) YYYY-MM-DD" },
  has_due_date: { type: "boolean", description: "האם יש תאריך יעד" },
  search: { type: "string", description: "חיפוש טקסט חופשי בכותרת ובתיאור" },
};

const filterSchema = {
  type: "object",
  description:
    "מסנן לבחירת משימות. אובייקט ריק {} = כל המשימות בבחירה הנוכחית.",
  properties: filterProps,
};

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_tasks",
      description: "קורא משימות (כולל מזהים) מהמרחבים שבבחירה הנוכחית, עם סינון אופציונלי.",
      parameters: {
        type: "object",
        properties: { ...filterProps, limit: { type: "integer", description: "מקסימום תוצאות (ברירת מחדל 100)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tasks",
      description: "מוסיף משימה אחת או יותר. אם בחירה נוכחית היא מרחב אחד - המשימות נוספות אליו.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                space: { type: "string", description: "שם המרחב. חובה כשהבחירה היא כל המרחבים." },
                priority: { type: "string", enum: [...PRIORITIES] },
                status: { type: "string", enum: [...STATUSES] },
                due_date: { type: "string", description: "YYYY-MM-DD" },
                description: { type: "string" },
              },
              required: ["title"],
            },
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_tasks",
      description:
        "מעדכן משימות. בוחרים משימות לפי task_ids או לפי filter, ומגדירים changes. המערכת מבקשת אישור מהמשתמש אוטומטית כשמעדכנים יותר מ-3 משימות.",
      parameters: {
        type: "object",
        properties: {
          task_ids: { type: "array", items: { type: "string" } },
          filter: filterSchema,
          changes: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: { type: "string", enum: [...PRIORITIES] },
              status: { type: "string", enum: [...STATUSES] },
              due_date: { type: ["string", "null"], description: "YYYY-MM-DD, או null להסרת תאריך" },
              shift_days: { type: "integer", description: "הזזת תאריך היעד של כל משימה במספר ימים (משימה בלי תאריך תקבל היום+N)" },
              space: { type: "string", description: "העברת המשימה למרחב אחר (בתוך הבחירה)" },
            },
          },
        },
        required: ["changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_tasks",
      description: "מוחק משימות לפי task_ids או filter. המערכת מבקשת אישור מהמשתמש אוטומטית לפני כל מחיקה.",
      parameters: {
        type: "object",
        properties: { task_ids: { type: "array", items: { type: "string" } }, filter: filterSchema },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_tasks",
      description:
        "מחזיר סיכום מספרי של המשימות בבחירה הנוכחית: פתוחות, באיחור, להיום, דחופות, הושלמו השבוע - לכל מרחב ובסך הכל, וכן רשימת המשימות שדורשות תשומת לב.",
      parameters: { type: "object", properties: { space: { type: "string" } } },
    },
  },
] as const;

/* ---------------------------------------------------------------------- */
/* Tool runtime                                                            */
/* ---------------------------------------------------------------------- */

interface Ctx {
  scopeSpaces: Space[];
  allSpaces: Space[];
  today: string;
}

class ToolError extends Error {}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function norm(s: string) {
  return s.trim().toLowerCase().replace(/^ה(?=.{2,})/, "");
}

function resolveSpace(ref: string, ctx: Ctx): Space {
  const r = ref.trim();
  const inScope = (list: Space[]) =>
    list.find((s) => s.id === r) ??
    list.find((s) => s.name.trim().toLowerCase() === r.toLowerCase()) ??
    list.find((s) => norm(s.name) === norm(r)) ??
    list.find((s) => norm(s.name).includes(norm(r)) || norm(r).includes(norm(s.name)));
  const found = inScope(ctx.scopeSpaces);
  if (found) return found;
  if (inScope(ctx.allSpaces)) {
    throw new ToolError(
      `המרחב "${ref}" אינו חלק מהבחירה הנוכחית של הסוכן. בקש מהמשתמש לשנות את הבחירה בראש חלון הצ'אט.`,
    );
  }
  throw new ToolError(
    `לא נמצא מרחב בשם "${ref}". המרחבים הזמינים: ${ctx.scopeSpaces.map((s) => s.name).join(", ")}`,
  );
}

function buildFilter(raw: Record<string, unknown> | undefined, ctx: Ctx): TaskFilter {
  const f = (raw ?? {}) as Record<string, any>;
  const out: TaskFilter = { spaceIds: ctx.scopeSpaces.map((s) => s.id) };
  if (typeof f.space === "string" && f.space.trim()) out.spaceIds = [resolveSpace(f.space, ctx).id];
  if (Array.isArray(f.status) && f.status.length) out.status = f.status.filter((x: any) => STATUSES.includes(x)) as Status[];
  if (Array.isArray(f.priority) && f.priority.length) out.priority = f.priority.filter((x: any) => PRIORITIES.includes(x)) as Priority[];
  if (f.overdue === true) out.overdue = true;
  for (const [k, key] of [["due_on", "dueOn"], ["due_from", "dueFrom"], ["due_to", "dueTo"]] as const) {
    if (f[k] != null && f[k] !== "") {
      if (!dateStr.safeParse(f[k]).success) throw new ToolError(`תאריך לא תקין ב-${k}: ${f[k]}`);
      (out as any)[key] = f[k];
    }
  }
  if (typeof f.has_due_date === "boolean") out.hasDueDate = f.has_due_date;
  if (typeof f.search === "string" && f.search.trim()) out.search = f.search.trim();
  return out;
}

function brief(t: Task, spaces: Space[], today: string) {
  return {
    id: t.id,
    space: spaces.find((s) => s.id === t.space_id)?.name ?? "?",
    title: t.title,
    priority: t.priority,
    status: t.status,
    due_date: t.due_date,
    overdue: !!t.due_date && t.due_date < today && t.status !== "done",
    ...(t.description ? { description: t.description.slice(0, 200) } : {}),
  };
}

const PRIORITY_ORDER = (p: Priority) => 5 - PRIORITY_META[p].rank;

interface Prepared {
  count: number;
  needsConfirm: boolean;
  label: string;
  samples: string[];
  mutates: boolean;
  run: () => Promise<{ result: unknown; summary: string; changed: number }>;
}

async function resolveTargets(args: any, ctx: Ctx): Promise<Task[]> {
  const ids: string[] | undefined = Array.isArray(args.task_ids) ? args.task_ids.map(String) : undefined;
  if (ids?.length) {
    const tasks = await listTasks({ ids: ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)) }, ctx.today);
    const allowed = new Set(ctx.scopeSpaces.map((s) => s.id));
    return tasks.filter((t) => allowed.has(t.space_id));
  }
  if (args.filter && typeof args.filter === "object") {
    return listTasks(buildFilter(args.filter, ctx), ctx.today);
  }
  throw new ToolError("חובה לציין task_ids או filter (אפשר filter ריק כדי לבחור את כל המשימות בבחירה).");
}

function describeChanges(c: Record<string, any>, today: string): string {
  const parts: string[] = [];
  if (c.status) parts.push(`סטטוס ← ${STATUS_META[c.status as Status]?.label ?? c.status}`);
  if (c.priority) parts.push(`עדיפות ← ${PRIORITY_META[c.priority as Priority]?.label ?? c.priority}`);
  if (c.due_date === null) parts.push("הסרת תאריך יעד");
  else if (c.due_date) parts.push(`תאריך יעד ← ${shortDate(c.due_date, today)}`);
  if (typeof c.shift_days === "number") parts.push(`הזזת תאריך ב-${c.shift_days} ימים`);
  if (c.title) parts.push("שינוי כותרת");
  if (c.description !== undefined) parts.push("שינוי תיאור");
  if (c.space) parts.push(`העברה למרחב "${c.space}"`);
  return parts.join(", ");
}

async function prepare(name: string, args: any, ctx: Ctx): Promise<Prepared> {
  switch (name) {
    case "read_tasks": {
      const filter = buildFilter(args, ctx);
      return {
        count: 0, needsConfirm: false, label: "", samples: [], mutates: false,
        run: async () => {
          const tasks = await listTasks({ ...filter, limit: undefined }, ctx.today);
          tasks.sort(
            (a, b) =>
              (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) ||
              PRIORITY_ORDER(a.priority) - PRIORITY_ORDER(b.priority) ||
              (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
          );
          const limit = Math.min(Number(args.limit) || 100, 200);
          return {
            result: { total: tasks.length, tasks: tasks.slice(0, limit).map((t) => brief(t, ctx.allSpaces, ctx.today)) },
            summary: "", changed: 0,
          };
        },
      };
    }

    case "summarize_tasks": {
      const spaces = typeof args.space === "string" && args.space.trim() ? [resolveSpace(args.space, ctx)] : ctx.scopeSpaces;
      return {
        count: 0, needsConfirm: false, label: "", samples: [], mutates: false,
        run: async () => {
          const tasks = await listTasks({ spaceIds: spaces.map((s) => s.id) }, ctx.today);
          const weekStart = new Date(weekStartInstant(ctx.today)).getTime();
          const stat = (list: Task[]) => {
            const open = list.filter((t) => t.status !== "done");
            return {
              total: list.length,
              open: open.length,
              overdue: open.filter((t) => t.due_date && t.due_date < ctx.today).length,
              due_today: open.filter((t) => t.due_date === ctx.today).length,
              due_next_7_days: open.filter((t) => t.due_date && t.due_date > ctx.today && t.due_date <= addDays(ctx.today, 7)).length,
              urgent: open.filter((t) => t.priority === "urgent").length,
              done_this_week: list.filter((t) => t.completed_at && new Date(t.completed_at).getTime() >= weekStart).length,
              by_status: Object.fromEntries(STATUSES.map((s) => [s, list.filter((t) => t.status === s).length])),
              open_by_priority: Object.fromEntries(PRIORITIES.map((p) => [p, open.filter((t) => t.priority === p).length])),
            };
          };
          const attention = tasks
            .filter((t) => t.status !== "done" && (t.priority === "urgent" || (t.due_date && t.due_date <= ctx.today)))
            .sort((a, b) => PRIORITY_ORDER(a.priority) - PRIORITY_ORDER(b.priority) || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
            .slice(0, 15)
            .map((t) => brief(t, ctx.allSpaces, ctx.today));
          return {
            result: {
              today: ctx.today,
              totals: stat(tasks),
              per_space: spaces.map((s) => ({ space: s.name, ...stat(tasks.filter((t) => t.space_id === s.id)) })),
              needs_attention: attention,
            },
            summary: "", changed: 0,
          };
        },
      };
    }

    case "add_tasks": {
      const items: any[] = Array.isArray(args.tasks) ? args.tasks : [];
      if (!items.length) throw new ToolError("לא התקבלו משימות להוספה.");
      const inputs = items.map((it) => {
        const title = String(it.title ?? "").trim();
        if (!title) throw new ToolError("חסרה כותרת למשימה.");
        let space: Space;
        if (it.space) space = resolveSpace(String(it.space), ctx);
        else if (ctx.scopeSpaces.length === 1) space = ctx.scopeSpaces[0];
        else throw new ToolError(`חובה לציין לאיזה מרחב להוסיף את "${title}". המרחבים: ${ctx.scopeSpaces.map((s) => s.name).join(", ")}`);
        if (it.due_date && !dateStr.safeParse(it.due_date).success) throw new ToolError(`תאריך לא תקין: ${it.due_date}`);
        return {
          space_id: space.id,
          title: title.slice(0, 300),
          description: it.description ? String(it.description).slice(0, 5000) : undefined,
          priority: PRIORITIES.includes(it.priority) ? (it.priority as Priority) : undefined,
          status: STATUSES.includes(it.status) ? (it.status as Status) : undefined,
          due_date: it.due_date || null,
        };
      });
      return {
        count: inputs.length,
        needsConfirm: inputs.length > 3,
        label: `להוסיף ${inputs.length} משימות`,
        samples: inputs.map((i) => i.title),
        mutates: true,
        run: async () => {
          const created = await createTasks(inputs);
          return {
            result: { created: created.map((t) => brief(t, ctx.allSpaces, ctx.today)) },
            summary: `נוספו ${created.length} משימות`,
            changed: created.length,
          };
        },
      };
    }

    case "update_tasks": {
      const changes = (args.changes ?? {}) as Record<string, any>;
      if (changes.due_date && !dateStr.safeParse(changes.due_date).success) throw new ToolError(`תאריך לא תקין: ${changes.due_date}`);
      if (changes.status && !STATUSES.includes(changes.status)) throw new ToolError(`סטטוס לא תקין: ${changes.status}`);
      if (changes.priority && !PRIORITIES.includes(changes.priority)) throw new ToolError(`עדיפות לא תקינה: ${changes.priority}`);
      const targetSpace = changes.space ? resolveSpace(String(changes.space), ctx) : null;
      const targets = await resolveTargets(args, ctx);

      const patchFor = (t: Task) => {
        const patch: Record<string, any> = {};
        if (changes.title) patch.title = String(changes.title).slice(0, 300);
        if (changes.description !== undefined) patch.description = String(changes.description).slice(0, 5000);
        if (changes.priority) patch.priority = changes.priority;
        if (changes.status) patch.status = changes.status;
        if (changes.due_date !== undefined) patch.due_date = changes.due_date;
        if (typeof changes.shift_days === "number") patch.due_date = addDays(t.due_date ?? ctx.today, Math.trunc(changes.shift_days));
        if (targetSpace) patch.space_id = targetSpace.id;
        return patch;
      };
      // only tasks that would actually change
      const affected = targets.filter((t) => Object.entries(patchFor(t)).some(([k, v]) => (t as any)[k] !== v));
      const desc = describeChanges(changes, ctx.today);
      return {
        count: affected.length,
        needsConfirm: affected.length > 3,
        label: `לעדכן ${affected.length} משימות${desc ? ` (${desc})` : ""}`,
        samples: affected.map((t) => t.title),
        mutates: true,
        run: async () => {
          const updated: Task[] = [];
          for (const t of affected) {
            const u = await updateTask(t.id, patchFor(t));
            if (u) updated.push(u);
          }
          return {
            result: {
              updated_count: updated.length,
              skipped_unchanged: targets.length - affected.length,
              tasks: updated.slice(0, 30).map((t) => brief(t, ctx.allSpaces, ctx.today)),
            },
            summary: `עודכנו ${updated.length} משימות${desc ? ` (${desc})` : ""}`,
            changed: updated.length,
          };
        },
      };
    }

    case "delete_tasks": {
      const targets = await resolveTargets(args, ctx);
      return {
        count: targets.length,
        needsConfirm: targets.length > 0,
        label: `למחוק ${targets.length} משימות`,
        samples: targets.map((t) => t.title),
        mutates: true,
        run: async () => {
          const n = await deleteTasks(targets.map((t) => t.id));
          return { result: { deleted_count: n }, summary: `נמחקו ${n} משימות`, changed: n };
        },
      };
    }

    default:
      throw new ToolError(`כלי לא מוכר: ${name}`);
  }
}

/* ---------------------------------------------------------------------- */
/* Scope + context                                                         */
/* ---------------------------------------------------------------------- */

async function makeCtx(scope: Scope): Promise<Ctx> {
  const allSpaces = await listSpaces();
  const scopeSpaces = scope.type === "all" ? allSpaces : allSpaces.filter((s) => s.id === scope.spaceId);
  if (scope.type === "space" && scopeSpaces.length === 0) throw new Error("המרחב שנבחר לא נמצא");
  return { allSpaces, scopeSpaces, today: todayStr() };
}

function systemPrompt(ctx: Ctx, scope: Scope): string {
  const today = ctx.today;
  const scopeText =
    scope.type === "all"
      ? `כל המרחבים (${ctx.scopeSpaces.map((s) => `"${s.name}"`).join(", ") || "אין מרחבים"})`
      : `המרחב "${ctx.scopeSpaces[0].name}" בלבד`;
  return `אתה "סוכן המשימות" - עוזר אישי חכם בתוך מערכת לניהול משימות בעברית.
אתה עונה תמיד בעברית, בקצרה ובטון חם וענייני (עד 3-4 משפטים, או רשימה קצרה). בלי הקדמות מיותרות.

הקשר נוכחי:
- היום: ${longDate(today)} (${today}). מחר: ${addDays(today, 1)}. אתמול: ${addDays(today, -1)}. אזור זמן: ישראל, השבוע מתחיל ביום ראשון.
- הבחירה הנוכחית של הסוכן: ${scopeText}. אתה פועל רק על הבחירה הזו. מרחב מחוץ לבחירה - אל תנסה לגעת בו, והסבר למשתמש שאפשר לשנות את הבחירה בראש חלון הצ'אט.
- עדיפויות: low=נמוכה, medium=בינונית, high=גבוהה, urgent=דחוף. סטטוסים: new=חדשה, in_progress=בעבודה, on_hold=בהשהייה, done=הושלמה.

כללי עבודה:
1. לשאלות על המשימות - קרא נתונים בכלים (read_tasks / summarize_tasks) ואל תנחש. אל תמציא משימות או מזהים.
2. לפעולות - השתמש בכלים add_tasks / update_tasks / delete_tasks. אפשר לשלב כמה קריאות. כדי לפעול על קבוצה (למשל "כל מה שבאיחור") השתמש ב-filter, לא ברשימת מזהים ארוכה.
3. אל תבקש אישור בעצמך. המערכת מציגה למשתמש כפתורי אישור/דחייה אוטומטית לפני פעולה על יותר מ-3 משימות ולפני כל מחיקה - פשוט קרא לכלי.
4. תאריכים: המר ביטויים כמו "מחר", "ביום ראשון", "עד ה-10" לתאריך YYYY-MM-DD. "עד ה-10" = ה-10 הקרוב בחודש (אם כבר עבר החודש - בחודש הבא).
5. משימה חדשה בלי פרטים נוספים: עדיפות בינונית, סטטוס חדשה, בלי תאריך אלא אם צוין. כשהבחירה היא כל המרחבים, ציין לכל משימה את המרחב שהמשתמש ציין.
6. כשמבקשים לתת עדיפות/להמליץ: סכם לפי דחיפות, איחורים ותאריכי יעד, והצע 3-5 משימות מובילות עם נימוק של שורה אחת.
7. אחרי שביצעת פעולה, אמור בקצרה מה עשית (כמה משימות ומה השתנה). אם כלי החזיר שגיאה - הסבר למשתמש בפשטות מה חסר.
8. אם הבקשה לא קשורה לניהול משימות, ענה בנימוס בקצרה והחזר את השיחה למשימות.`;
}

/* ---------------------------------------------------------------------- */
/* OpenAI call                                                             */
/* ---------------------------------------------------------------------- */

type OAMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

function modelId(): string {
  const raw = process.env.OPENAI_MODEL || "gpt-6-luna";
  const base = process.env.OPENAI_BASE_URL;
  return !base || /api\.openai\.com/.test(base) ? raw.replace(/^openai\//, "") : raw;
}

async function callModel(messages: OAMessage[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: modelId(), messages, tools: TOOLS, tool_choice: "auto" }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("OpenAI error", res.status, text.slice(0, 500));
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] } }[];
  };
  return json.choices[0].message;
}

/* ---------------------------------------------------------------------- */
/* Public API                                                              */
/* ---------------------------------------------------------------------- */

export interface AgentResult {
  reply: string;
  mutated: boolean;
  pending?: PendingAction;
}

interface StoredStep {
  name: string;
  args: unknown;
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export async function runAgent(
  history: { role: "user" | "assistant"; content: string }[],
  scope: Scope,
): Promise<AgentResult> {
  const ctx = await makeCtx(scope);
  const messages: OAMessage[] = [
    { role: "system", content: systemPrompt(ctx, scope) },
    ...history.slice(-16).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }) as OAMessage),
  ];
  let mutated = false;

  for (let step = 0; step < 6; step++) {
    const msg = await callModel(messages);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      return { reply: (msg.content ?? "").trim() || "בוצע.", mutated };
    }
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const args = safeParse(call.function.arguments);
      let prepared: Prepared;
      try {
        prepared = await prepare(call.function.name, args, ctx);
      } catch (e) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: e instanceof ToolError ? e.message : "שגיאה בהרצת הכלי" }),
        });
        if (!(e instanceof ToolError)) console.error(e);
        continue;
      }

      if (prepared.needsConfirm) {
        // park this call (and the rest of the batch) until the user approves
        const rest = calls.slice(i);
        const steps: StoredStep[] = [];
        const preview: PendingAction["steps"] = [];
        let total = 0;
        for (const c of rest) {
          try {
            const a = safeParse(c.function.arguments);
            const p = c === call ? prepared : await prepare(c.function.name, a, ctx);
            if (!p.mutates || p.count === 0) continue;
            steps.push({ name: c.function.name, args: a });
            total += p.count;
            preview.push({ label: p.label, count: p.count, samples: p.samples.slice(0, 6) });
          } catch {
            /* skip steps that cannot be prepared */
          }
        }
        const rows = await query<{ id: string }>(
          `INSERT INTO tm_agent_actions (payload) VALUES ($1::jsonb) RETURNING id`,
          [JSON.stringify({ steps, scope })],
        );
        const title =
          preview.length === 1
            ? `אני עומד ${preview[0].label}.`
            : `אני עומד לבצע ${preview.length} פעולות על ${total} משימות.`;
        return {
          reply: `${title}\nלאשר?`,
          mutated,
          pending: { id: rows[0].id, title, total, steps: preview },
        };
      }

      const out = await prepared.run();
      if (prepared.mutates && out.changed > 0) mutated = true;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out.result) });
    }
  }
  return { reply: "הפעולה ארכה יותר מדי צעדים. נסה לנסח את הבקשה בצורה פשוטה יותר.", mutated };
}

export async function resolvePending(
  actionId: string,
  approve: boolean,
): Promise<AgentResult> {
  const rows = await query<{ payload: { steps: StoredStep[]; scope: Scope }; status: string; created_at: string }>(
    `UPDATE tm_agent_actions SET status = $2 WHERE id = $1 AND status = 'pending'
     RETURNING payload, status, created_at`,
    [actionId, approve ? "approved" : "rejected"],
  );
  if (!rows.length) return { reply: "הבקשה הזו כבר טופלה או שפג תוקפה.", mutated: false };
  if (!approve) return { reply: "בסדר, לא ביצעתי שום שינוי.", mutated: false };

  const { steps, scope } = rows[0].payload;
  if (Date.now() - new Date(rows[0].created_at).getTime() > 30 * 60 * 1000) {
    return { reply: "פג תוקף האישור (יותר מ-30 דקות). בקש שוב ואבצע.", mutated: false };
  }
  const ctx = await makeCtx(scope);
  const summaries: string[] = [];
  let mutated = false;
  for (const s of steps) {
    try {
      const p = await prepare(s.name, s.args, ctx);
      const out = await p.run();
      if (p.mutates) {
        if (out.changed > 0) mutated = true;
        summaries.push(out.summary);
      }
    } catch (e) {
      summaries.push(e instanceof ToolError ? e.message : "אחת הפעולות נכשלה");
    }
  }
  return { reply: `בוצע ✓ ${summaries.join(" · ")}.`, mutated };
}
