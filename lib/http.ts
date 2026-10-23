import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; res: Response };

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<Parsed<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, res: bad("invalid json") };
  }
  const res = schema.safeParse(json);
  if (!res.success) return { ok: false, res: bad("invalid input") };
  return { ok: true, data: res.data };
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      return bad("server error", 500);
    }
  };
}
