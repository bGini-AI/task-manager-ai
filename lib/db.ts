import { Pool, types } from "pg";

// DATE columns come back as plain "YYYY-MM-DD" strings (no timezone shifting)
types.setTypeParser(1082, (v: string) => v);

const globalForDb = globalThis as unknown as {
  __pool?: Pool;
  __schema?: Promise<void>;
};

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  return new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX) || 5,
    ssl: isLocal || /sslmode=/.test(url) ? undefined : { rejectUnauthorized: false },
  });
}

export function pool(): Pool {
  if (!globalForDb.__pool) globalForDb.__pool = createPool();
  return globalForDb.__pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tm_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL,
  view text NOT NULL DEFAULT 'kanban',
  position double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES tm_spaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'new',
  due_date date,
  completed_at timestamptz,
  position double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tm_tasks_space_idx ON tm_tasks(space_id);
CREATE TABLE IF NOT EXISTS tm_settings (
  key text PRIMARY KEY,
  value jsonb
);
CREATE TABLE IF NOT EXISTS tm_agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

export function ensureSchema(): Promise<void> {
  if (!globalForDb.__schema) {
    globalForDb.__schema = pool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((e) => {
        globalForDb.__schema = undefined;
        throw e;
      });
  }
  return globalForDb.__schema;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query(text, params as unknown[]);
  return res.rows as T[];
}
