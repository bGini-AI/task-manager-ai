import { NextResponse } from "next/server";
import { createTask } from "@/lib/tasks";
import { taskCreateSchema } from "@/lib/schemas";
import { handle, parseBody } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const parsed = await parseBody(req, taskCreateSchema);
  if (!parsed.ok) return parsed.res;
  return NextResponse.json(await createTask(parsed.data), { status: 201 });
});
