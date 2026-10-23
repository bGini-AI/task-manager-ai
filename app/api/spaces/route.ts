import { NextResponse } from "next/server";
import { createSpace } from "@/lib/tasks";
import { spaceCreateSchema } from "@/lib/schemas";
import { handle, parseBody } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const parsed = await parseBody(req, spaceCreateSchema);
  if (!parsed.ok) return parsed.res;
  return NextResponse.json(await createSpace(parsed.data), { status: 201 });
});
