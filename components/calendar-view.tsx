"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarOff, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import clsx from "clsx";
import { PRIORITY_META } from "@/lib/constants";
import { HE_DAYS, addMonths, longDate, monthGrid, monthTitle } from "@/lib/dates";
import { byImportance } from "@/lib/selectors";
import type { Space, Task } from "@/lib/types";
import { useData } from "./data-provider";
import { Button, Modal } from "./ui";
import { TaskRow } from "./task-row";

const MAX_CHIPS = 3;

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)");
    const f = () => setM(q.matches);
    f();
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return m;
}

export function CalendarView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, newTask, openTask, patchTask } = useData();
  const isMobile = useIsMobile();
  const [anchor, setAnchor] = useState(today.slice(0, 8) + "01");
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [undatedOpen, setUndatedOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      (map.get(t.due_date) ?? map.set(t.due_date, []).get(t.due_date)!).push(t);
    }
    for (const list of map.values()) list.sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) || byImportance(a, b));
    return map;
  }, [tasks]);
  const undated = tasks.filter((t) => !t.due_date && t.status !== "done");

  const month = anchor.slice(0, 7);
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const over = e.over?.id ? String(e.over.id) : null;
    const task = tasks.find((t) => t.id === String(e.active.id));
    if (!over || !task || !over.startsWith("day:")) return;
    const date = over.slice(4);
    if (task.due_date !== date) patchTask(task.id, { due_date: date });
  }

  function clickDay(date: string) {
    if (isMobile) setDayOpen(date);
    else newTask({ space_id: space.id, due_date: date });
  }

  const dayTasks = dayOpen ? (byDay.get(dayOpen) ?? []) : [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="min-w-36 text-xl font-bold">{monthTitle(anchor)}</h2>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setAnchor(addMonths(anchor, -1))} aria-label="חודש קודם" className="rounded-full p-2 text-muted transition hover:bg-white hover:text-ink">
              <ChevronRight className="size-5" />
            </button>
            <button onClick={() => setAnchor(addMonths(anchor, 1))} aria-label="חודש הבא" className="rounded-full p-2 text-muted transition hover:bg-white hover:text-ink">
              <ChevronLeft className="size-5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {undated.length > 0 && (
            <Button onClick={() => setUndatedOpen(true)}>
              <CalendarOff className="size-4" />
              ללא תאריך ({undated.length})
            </Button>
          )}
          <Button onClick={() => setAnchor(today.slice(0, 8) + "01")} disabled={month === today.slice(0, 7)}>
            היום
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="grid grid-cols-7 border-b border-line bg-bg/60">
            {HE_DAYS.map((d, i) => (
              <div key={d} className={clsx("py-2.5 text-center text-xs font-bold text-muted", i === 6 && "text-faint")}>
                <span className="sm:hidden">{d[0]}</span>
                <span className="hidden sm:inline">יום {d}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((date, i) => (
              <DayCell
                key={date}
                date={date}
                inMonth={date.startsWith(month)}
                isToday={date === today}
                isLastRow={i >= grid.length - 7}
                isFirstCol={i % 7 === 0}
                tasks={byDay.get(date) ?? []}
                color={space.color}
                isMobile={isMobile}
                onClickDay={() => clickDay(date)}
                onMore={() => setDayOpen(date)}
                onOpenTask={openTask}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>{active ? <Chip task={active} overlay /> : null}</DragOverlay>
      </DndContext>

      <p className="mt-3 text-center text-xs text-faint">לחיצה על יום פותחת משימה חדשה בתאריך הזה · אפשר לגרור משימה ליום אחר</p>

      <Modal
        open={!!dayOpen}
        onClose={() => setDayOpen(null)}
        title={dayOpen ? longDate(dayOpen) : ""}
        width="max-w-md"
        footer={
          <Button
            variant="primary"
            style={{ background: space.color }}
            onClick={() => {
              const d = dayOpen!;
              setDayOpen(null);
              newTask({ space_id: space.id, due_date: d });
            }}
          >
            <Plus className="size-4" />
            משימה חדשה ליום הזה
          </Button>
        }
      >
        {dayTasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">אין משימות ביום הזה.</p>
        ) : (
          <div className="-mx-2">
            {dayTasks.map((t) => (
              <div key={t.id} onClick={() => setDayOpen(null)}>
                <TaskRow task={t} showSpace={false} />
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={undatedOpen} onClose={() => setUndatedOpen(false)} title="משימות ללא תאריך יעד" width="max-w-md">
        <div className="-mx-2">
          {undated.map((t) => (
            <div key={t.id} onClick={() => setUndatedOpen(false)}>
              <TaskRow task={t} showSpace={false} />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function DayCell({
  date,
  inMonth,
  isToday,
  isLastRow,
  isFirstCol,
  tasks,
  color,
  isMobile,
  onClickDay,
  onMore,
  onOpenTask,
}: {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isLastRow: boolean;
  isFirstCol: boolean;
  tasks: Task[];
  color: string;
  isMobile: boolean;
  onClickDay: () => void;
  onMore: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const day = Number(date.slice(8));
  const shown = isMobile ? [] : tasks.slice(0, MAX_CHIPS);
  const rest = tasks.length - shown.length;

  return (
    <div
      ref={setNodeRef}
      onClick={onClickDay}
      className={clsx(
        "group relative min-h-[72px] cursor-pointer border-line p-1 transition-colors sm:min-h-[118px] sm:p-1.5",
        !isLastRow && "border-b",
        !isFirstCol && "border-s",
        !inMonth && "bg-bg/50",
        isOver ? "bg-brand-soft" : "hover:bg-bg/70",
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={clsx(
            "flex size-7 items-center justify-center rounded-full text-[13px] font-medium",
            isToday ? "font-bold text-white" : inMonth ? "text-ink" : "text-faint",
          )}
          style={isToday ? { background: color } : undefined}
        >
          {day}
        </span>
        <Plus className="mt-1.5 me-1 hidden size-3.5 text-faint opacity-0 transition group-hover:opacity-100 sm:block" />
      </div>

      {/* desktop chips */}
      <div className="mt-0.5 hidden space-y-0.5 sm:block">
        {shown.map((t) => (
          <DraggableChip key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />
        ))}
        {rest > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMore();
            }}
            className="w-full rounded px-1.5 py-0.5 text-start text-xs font-medium text-muted hover:bg-line/60"
          >
            +{rest} עוד
          </button>
        )}
      </div>

      {/* mobile dots */}
      {tasks.length > 0 && (
        <div className="mt-1 flex flex-wrap justify-center gap-1 sm:hidden">
          {tasks.slice(0, 6).map((t) => (
            <span key={t.id} className="size-2 rounded-full" style={{ background: t.status === "done" ? "#c7ccd6" : PRIORITY_META[t.priority].color }} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraggableChip({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={clsx("outline-none", isDragging && "opacity-30")}
    >
      <Chip task={task} />
    </div>
  );
}

function Chip({ task, overlay }: { task: Task; overlay?: boolean }) {
  const done = task.status === "done";
  const color = PRIORITY_META[task.priority].color;
  return (
    <div
      title={task.title}
      className={clsx(
        "cursor-grab truncate rounded-md px-1.5 py-[3px] text-xs font-medium leading-tight transition active:cursor-grabbing",
        done ? "bg-line/80 text-faint line-through" : "text-white hover:brightness-110",
        overlay && "shadow-pop",
      )}
      style={done ? undefined : { background: color }}
    >
      {task.title}
    </div>
  );
}
