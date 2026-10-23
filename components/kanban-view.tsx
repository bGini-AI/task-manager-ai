"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import clsx from "clsx";
import { PRIORITY_META, STATUSES, STATUS_META, type Status } from "@/lib/constants";
import type { Space, Task } from "@/lib/types";
import { useData } from "./data-provider";
import { DueLabel } from "./task-row";
import { PriorityBadge } from "./ui";

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function KanbanView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { patchTask, newTask } = useData();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const byStatus = (s: Status) => tasks.filter((t) => t.status === s).sort((a, b) => a.position - b.position);
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    let status: Status;
    let overTask: Task | undefined;
    if (over.startsWith("col:")) status = over.slice(4) as Status;
    else {
      overTask = tasks.find((t) => t.id === over);
      if (!overTask) return;
      status = overTask.status;
    }

    const full = byStatus(status);
    const column = full.filter((t) => t.id !== id);
    let position: number;
    if (overTask && overTask.id !== id) {
      const idx = column.findIndex((t) => t.id === overTask!.id);
      const movingDown =
        status === task.status && full.findIndex((t) => t.id === id) < full.findIndex((t) => t.id === overTask!.id);
      if (movingDown) {
        const next = column[idx + 1]?.position;
        position = next !== undefined ? (overTask.position + next) / 2 : overTask.position + 1;
      } else {
        const before = column[idx - 1]?.position;
        position = before !== undefined ? (before + overTask.position) / 2 : overTask.position - 1;
      }
    } else {
      position = (column[column.length - 1]?.position ?? 0) + 1;
    }
    if (status === task.status && overTask?.id === id) return;
    patchTask(id, { status, position });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {STATUSES.map((s) => (
          <Column key={s} status={s} tasks={byStatus(s)} space={space} onAdd={() => newTask({ space_id: space.id, status: s })} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160 }}>{active ? <Card task={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, tasks, space, onAdd }: { status: Status; tasks: Task[]; space: Space; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const m = STATUS_META[status];
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[420px] w-[280px] shrink-0 flex-col rounded-2xl border bg-[#eceef3]/70 p-2.5 transition lg:w-auto",
        isOver ? "border-transparent ring-2" : "border-transparent",
      )}
      style={isOver ? { ["--tw-ring-color" as string]: space.color, background: `${space.color}10` } : undefined}
    >
      <div className="mb-2.5 flex items-center justify-between px-1.5 pt-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: m.color }} />
          <h3 className="font-bold">{m.label}</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-muted">{tasks.length}</span>
        </div>
        <button onClick={onAdd} aria-label={`משימה חדשה ב${m.label}`} className="rounded-lg p-1 text-muted transition hover:bg-white hover:text-ink">
          <Plus className="size-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2.5">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} />
        ))}
        {tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line-strong/80 py-8 text-sm text-faint">גרור לכאן משימה</div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task }: { task: Task }) {
  const { openTask } = useData();
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: task.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: task.id });
  return (
    <div
      ref={(n) => {
        setDragRef(n);
        setDropRef(n);
      }}
      {...listeners}
      {...attributes}
      onClick={() => openTask(task.id)}
      className={clsx("touch-manipulation outline-none", isDragging && "opacity-30")}
    >
      <Card task={task} />
    </div>
  );
}

function Card({ task, overlay }: { task: Task; overlay?: boolean }) {
  const { today } = useData();
  const done = task.status === "done";
  return (
    <div
      className={clsx(
        "cursor-grab rounded-xl border border-line bg-surface p-3 shadow-card transition hover:shadow-md active:cursor-grabbing",
        overlay && "rotate-2 cursor-grabbing shadow-pop",
      )}
      style={{ borderInlineStartWidth: 4, borderInlineStartColor: PRIORITY_META[task.priority].color }}
    >
      <div className={clsx("text-[15px] font-medium leading-snug", done && "text-faint line-through")}>{task.title}</div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <PriorityBadge priority={task.priority} />
        <DueLabel task={task} today={today} />
      </div>
    </div>
  );
}
