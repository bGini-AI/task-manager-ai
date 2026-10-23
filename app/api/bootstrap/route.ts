import { NextResponse } from "next/server";
import { listSpaces, listTasks, getSetting } from "@/lib/tasks";
import { todayStr } from "@/lib/dates";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const [spaces, tasks, dashboardSpaces] = await Promise.all([
    listSpaces(),
    listTasks(),
    getSetting<string[]>("dashboard_spaces"),
  ]);
  return NextResponse.json({ spaces, tasks, dashboardSpaces, today: todayStr() });
});
