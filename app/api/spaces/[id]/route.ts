import { NextResponse } from "next/server";
import { deleteSpace, updateSpace } from "@/lib/tasks";
import { spacePatchSchema } from "@/lib/schemas";
import { bad, handle, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, spacePatchSchema);
  if (!parsed.ok) return parsed.res;
  const space = await updateSpace(id, parsed.data);
  return space ? NextResponse.json(space) : bad("not found", 404);
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return (await deleteSpace(id)) ? NextResponse.json({ ok: true }) : bad("not found", 404);
});
