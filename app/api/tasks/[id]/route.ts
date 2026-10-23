import { NextResponse } from "next/server";
import { deleteTask, updateTask } from "@/lib/tasks";
import { taskPatchSchema } from "@/lib/schemas";
import { bad, handle, parseBody } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, taskPatchSchema);
  if (!parsed.ok) return parsed.res;
  const task = await updateTask(id, parsed.data);
  return task ? NextResponse.json(task) : bad("not found", 404);
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return (await deleteTask(id)) ? NextResponse.json({ ok: true }) : bad("not found", 404);
});
