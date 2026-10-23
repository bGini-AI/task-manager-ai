import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { bad, parseBody } from "@/lib/http";

export const maxDuration = 60;

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(60),
  scope: z.union([
    z.object({ type: z.literal("all") }),
    z.object({ type: z.literal("space"), spaceId: z.string().uuid() }),
  ]),
});

export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  try {
    const result = await runAgent(parsed.data.messages, parsed.data.scope);
    return NextResponse.json(result);
  } catch (e) {
    console.error("chat error", e);
    return bad("הסוכן לא הצליח לענות כרגע. נסה שוב בעוד רגע.", 502);
  }
}
