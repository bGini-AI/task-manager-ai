import { NextResponse } from "next/server";
import { z } from "zod";
import { resolvePending } from "@/lib/agent";
import { bad, parseBody } from "@/lib/http";

export const maxDuration = 60;

const schema = z.object({ actionId: z.string().uuid(), approve: z.boolean() });

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  try {
    return NextResponse.json(await resolvePending(parsed.data.actionId, parsed.data.approve));
  } catch (e) {
    console.error("confirm error", e);
    return bad("הפעולה נכשלה. נסה שוב.", 500);
  }
}
