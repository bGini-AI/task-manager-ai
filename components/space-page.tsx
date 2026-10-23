"use client";

import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import clsx from "clsx";
import { VIEWS, VIEW_META } from "@/lib/constants";
import { useData } from "./data-provider";
import { CalendarView } from "./calendar-view";
import { KanbanView } from "./kanban-view";
import { VIEW_ICON } from "./space-dialog";
import { TodoView } from "./todo-view";
import { Button, Spinner } from "./ui";

export function SpacePage({ id }: { id: string }) {
  const { loaded, spaces, tasks, newTask, openSpace, patchSpace } = useData();
  const space = spaces.find((s) => s.id === id);

  if (!loaded) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!space) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-bold">המרחב לא נמצא</h1>
        <p className="mt-1 text-muted">ייתכן שהוא נמחק.</p>
        <Link href="/" className="mt-4 inline-block font-medium text-brand-ink hover:underline">
          חזרה לדשבורד
        </Link>
      </div>
    );
  }

  const mine = tasks.filter((t) => t.space_id === space.id);

  return (
    <div className={clsx("mx-auto flex flex-col", space.view === "kanban" ? "max-w-[1400px]" : space.view === "calendar" ? "max-w-6xl" : "max-w-3xl")}>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="size-4 rounded-full" style={{ background: space.color }} />
          <h1 className="text-2xl font-bold sm:text-3xl">{space.name}</h1>
          <button
            onClick={() => openSpace(space.id)}
            aria-label="הגדרות מרחב"
            title="הגדרות מרחב"
            className="rounded-lg p-1.5 text-muted transition hover:bg-white hover:text-ink"
          >
            <Settings2 className="size-[18px]" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-xl border border-line bg-white p-1 shadow-card" role="tablist" aria-label="תצוגה">
            {VIEWS.map((v) => {
              const Icon = VIEW_ICON[v];
              const active = space.view === v;
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={active}
                  onClick={() => !active && patchSpace(space.id, { view: v })}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                    active ? "text-white shadow-sm" : "text-muted hover:text-ink",
                  )}
                  style={active ? { background: space.color } : undefined}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{VIEW_META[v].label}</span>
                </button>
              );
            })}
          </div>
          <Button variant="primary" style={{ background: space.color }} onClick={() => newTask({ space_id: space.id })}>
            <Plus className="size-4" />
            משימה חדשה
          </Button>
        </div>
      </header>

      {space.view === "kanban" && <KanbanView space={space} tasks={mine} />}
      {space.view === "todo" && <TodoView space={space} tasks={mine} />}
      {space.view === "calendar" && <CalendarView space={space} tasks={mine} />}
    </div>
  );
}
