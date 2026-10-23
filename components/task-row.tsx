"use client";

import { Check } from "lucide-react";
import clsx from "clsx";
import { PRIORITY_META } from "@/lib/constants";
import { shortDate } from "@/lib/dates";
import { isOverdue } from "@/lib/selectors";
import type { Task } from "@/lib/types";
import { useData } from "./data-provider";
import { PriorityBadge } from "./ui";

export function CheckCircle({ task, size = 22 }: { task: Task; size?: number }) {
  const { patchTask } = useData();
  const done = task.status === "done";
  const color = PRIORITY_META[task.priority].color;
  return (
    <button
      type="button"
      aria-label={done ? "סימון כלא הושלמה" : "סימון כהושלמה"}
      onClick={(e) => {
        e.stopPropagation();
        patchTask(task.id, { status: done ? "new" : "done" });
      }}
      className="flex shrink-0 items-center justify-center rounded-full border-2 transition hover:scale-110"
      style={{
        width: size,
        height: size,
        borderColor: color,
        background: done ? color : "transparent",
      }}
    >
      {done && <Check className="text-white" style={{ width: size * 0.6, height: size * 0.6 }} strokeWidth={3.5} />}
    </button>
  );
}

export function DueLabel({ task, today, className }: { task: Task; today: string; className?: string }) {
  if (!task.due_date) return null;
  const overdue = isOverdue(task, today);
  return (
    <span className={clsx("whitespace-nowrap text-xs", overdue ? "font-medium text-red-600" : "text-muted", className)}>
      {shortDate(task.due_date, today)}
    </span>
  );
}

/** A compact row used in dashboard lists */
export function TaskRow({ task, showSpace = true }: { task: Task; showSpace?: boolean }) {
  const { spaces, today, openTask } = useData();
  const space = spaces.find((s) => s.id === task.space_id);
  const done = task.status === "done";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => e.key === "Enter" && openTask(task.id)}
      className="group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-bg"
    >
      <CheckCircle task={task} />
      <div className="min-w-0 flex-1">
        <div className={clsx("truncate text-[15px] font-medium", done && "text-faint line-through")}>{task.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {showSpace && space && (
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: space.color }} />
              {space.name}
            </span>
          )}
          <DueLabel task={task} today={today} />
        </div>
      </div>
      <PriorityBadge priority={task.priority} className="hidden sm:inline-flex" />
    </div>
  );
}
