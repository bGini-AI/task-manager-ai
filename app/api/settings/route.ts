import { NextResponse } from "next/server";
import { z } from "zod";
import { setSetting } from "@/lib/tasks";
import { handle, parseBody } from "@/lib/http";

const schema = z.object({ dashboardSpaces: z.array(z.string().uuid()).nullable() });

export const PUT = handle(async (req: Request) => {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  await setSetting("dashboard_spaces", parsed.data.dashboardSpaces);
  return NextResponse.json({ ok: true });
});
