"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import clsx from "clsx";
import { PRIORITIES, PRIORITY_META, type Priority } from "@/lib/constants";
import { isOverdue } from "@/lib/selectors";
import type { Space, Task } from "@/lib/types";
import { useData } from "./data-provider";
import { CheckCircle, DueLabel } from "./task-row";
import { StatusBadge } from "./ui";

export function TodoView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, openTask, createTask } = useData();
  const [showDone, setShowDone] = useState(false);
  const [quick, setQuick] = useState("");

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    await createTask({ space_id: space.id, title });
  }

  const groups = [...PRIORITIES].reverse().map((p) => ({
    p,
    items: open
      .filter((t) => t.priority === p)
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.position - b.position),
  }));

  return (
    <div className="space-y-5">
      <form onSubmit={quickAdd} className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-card focus-within:ring-2 focus-within:ring-brand/30">
        <Plus className="ms-2 size-5 shrink-0 text-faint" />
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="הוסף משימה מהירה ולחץ Enter…"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[15px] outline-none"
        />
        {quick.trim() && (
          <button className="rounded-xl px-4 py-1.5 text-sm font-medium text-white" style={{ background: space.color }}>
            הוספה
          </button>
        )}
      </form>

      {open.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <p className="text-lg font-bold">הכל נקי ✨</p>
          <p className="mt-1 text-sm text-muted">אין משימות פתוחות במרחב הזה.</p>
        </div>
      )}

      {groups.map(
        ({ p, items }) =>
          items.length > 0 && (
            <section key={p}>
              <PriorityHeader p={p} count={items.length} />
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                {items.map((t, i) => (
                  <Row key={t.id} task={t} today={today} first={i === 0} onOpen={() => openTask(t.id)} />
                ))}
              </div>
            </section>
          ),
      )}

      {done.length > 0 && (
        <section>
          <button
            onClick={() => setShowDone(!showDone)}
            className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-muted hover:text-ink"
          >
            <ChevronDown className={clsx("size-4 transition", !showDone && "-rotate-90")} />
            הושלמו ({done.length})
          </button>
          {showDone && (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {done.map((t, i) => (
                <Row key={t.id} task={t} today={today} first={i === 0} onOpen={() => openTask(t.id)} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PriorityHeader({ p, count }: { p: Priority; count: number }) {
  const m = PRIORITY_META[p];
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <span className="size-2.5 rounded-full" style={{ background: m.color }} />
      <h2 className="text-sm font-bold" style={{ color: m.color }}>
        {m.label}
      </h2>
      <span className="text-xs text-faint">{count}</span>
    </div>
  );
}

function Row({ task, today, first, onOpen }: { task: Task; today: string; first: boolean; onOpen: () => void }) {
  const done = task.status === "done";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={clsx("flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-bg/70", !first && "border-t border-line")}
    >
      <CheckCircle task={task} size={24} />
      <div className="min-w-0 flex-1">
        <div className={clsx("truncate text-[15px] font-medium", done && "text-faint line-through")}>{task.title}</div>
        {task.description && !done && <div className="truncate text-xs text-muted">{task.description}</div>}
      </div>
      {!done && task.status !== "new" && <StatusBadge status={task.status} className="hidden sm:inline-flex" />}
      <DueLabel task={task} today={today} className={clsx(isOverdue(task, today) && "rounded-full bg-red-50 px-2 py-0.5")} />
    </div>
  );
}
