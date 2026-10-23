"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronLeft, Flame, Plus, Sparkles } from "lucide-react";
import clsx from "clsx";
import { VIEW_META } from "@/lib/constants";
import { longDate } from "@/lib/dates";
import { byImportance, isDueToday, isOpen, isOverdue, spaceStats } from "@/lib/selectors";
import type { Task } from "@/lib/types";
import { useData } from "./data-provider";
import { VIEW_ICON } from "./space-dialog";
import { TaskRow } from "./task-row";
import { Button, Spinner } from "./ui";

const LIMIT = 6;

export function Dashboard() {
  const { loaded, error, spaces, tasks, today, dashboardSpaces, setDashboardSpaces, newTask, openSpace } = useData();

  const selected = useMemo(
    () => (dashboardSpaces === null ? spaces.map((s) => s.id) : dashboardSpaces.filter((id) => spaces.some((s) => s.id === id))),
    [dashboardSpaces, spaces],
  );
  const selectedSet = new Set(selected);
  const chosen = tasks.filter((t) => selectedSet.has(t.space_id));

  const urgent = chosen.filter((t) => isOpen(t) && t.priority === "urgent").sort(byImportance);
  const dueToday = chosen.filter((t) => isDueToday(t, today)).sort(byImportance);
  const overdue = chosen.filter((t) => isOverdue(t, today)).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));

  if (!loaded) {
    return (
      <div className="flex h-64 items-center justify-center">
        {error ? <p className="text-muted">לא הצלחתי לטעון את הנתונים. נסה לרענן.</p> : <Spinner />}
      </div>
    );
  }

  function toggle(id: string) {
    const next = selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setDashboardSpaces(next.length === spaces.length ? null : next);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">דשבורד</h1>
          <p className="mt-1 text-muted">{longDate(today)}</p>
        </div>
        {spaces.length > 0 && (
          <Button variant="primary" onClick={() => newTask({ space_id: selected[0] ?? spaces[0].id })}>
            <Plus className="size-4" />
            משימה חדשה
          </Button>
        )}
      </header>

      {spaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <Sparkles className="mx-auto mb-3 size-8 text-brand" />
          <h2 className="text-lg font-bold">נתחיל? צור את המרחב הראשון שלך</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">מרחב הוא אוסף משימות: בית, עבודה, לימודים, או כל דבר אחר. לכל מרחב צבע ותצוגה משלו.</p>
          <Button variant="primary" className="mt-4" onClick={() => openSpace()}>
            <Plus className="size-4" />
            מרחב חדש
          </Button>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-card sm:p-4">
            <div className="mb-2.5 text-sm font-medium text-muted">אילו מרחבים להציג</div>
            <div className="flex flex-wrap gap-2">
              {spaces.map((s) => {
                const on = selectedSet.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    aria-pressed={on}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                      on ? "text-ink" : "border-line-strong bg-white text-faint hover:bg-bg",
                    )}
                    style={on ? { background: `${s.color}14`, borderColor: s.color } : undefined}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: on ? s.color : "#cbd2de" }} />
                    {s.name}
                  </button>
                );
              })}
              {spaces.length > 1 && (
                <button
                  onClick={() => setDashboardSpaces(null)}
                  className="rounded-full px-3 py-1.5 text-sm text-brand-ink hover:bg-brand-soft"
                >
                  הצג הכל
                </button>
              )}
            </div>
          </section>

          {selected.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-muted">לא נבחר אף מרחב. בחר מרחב אחד לפחות כדי לראות משימות.</p>
          ) : (
            <section className="grid gap-4 lg:grid-cols-3">
              <Panel title="דחוף" icon={<Flame className="size-4" />} color="#dc2626" tasks={urgent} empty="אין משימות דחופות 🎉" />
              <Panel title="להיום" icon={<CalendarClock className="size-4" />} color="#2563eb" tasks={dueToday} empty="אין משימות להיום" />
              <Panel title="באיחור" icon={<AlertTriangle className="size-4" />} color="#ea580c" tasks={overdue} empty="אין משימות באיחור 👏" />
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">המרחבים שלי</h2>
              <Button variant="ghost" onClick={() => openSpace()}>
                <Plus className="size-4" />
                מרחב חדש
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {spaces
                .filter((s) => selectedSet.has(s.id))
                .map((s) => {
                  const st = spaceStats(tasks, s.id, today);
                  const Icon = VIEW_ICON[s.view];
                  return (
                    <Link
                      key={s.id}
                      href={`/spaces/${s.id}`}
                      className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
                    >
                      <div className="h-1.5" style={{ background: s.color }} />
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="size-3 rounded-full" style={{ background: s.color }} />
                            <span className="text-lg font-bold">{s.name}</span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs text-muted">
                            <Icon className="size-3.5" />
                            {VIEW_META[s.view].label}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <Stat n={st.open} label="פתוחות" />
                          <Stat n={st.overdue} label="באיחור" danger={st.overdue > 0} />
                          <Stat n={st.doneThisWeek} label="נסגרו השבוע" good={st.doneThisWeek > 0} />
                        </div>
                        <div className="mt-3 flex items-center justify-end text-xs font-medium text-muted opacity-0 transition group-hover:opacity-100">
                          כניסה למרחב
                          <ChevronLeft className="size-3.5" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ n, label, danger, good }: { n: number; label: string; danger?: boolean; good?: boolean }) {
  return (
    <div className="rounded-xl bg-bg px-2 py-2.5">
      <div className={clsx("text-2xl font-bold leading-none", danger && "text-red-600", good && "text-green-600")}>{n}</div>
      <div className="mt-1.5 text-xs text-muted">{label}</div>
    </div>
  );
}

function Panel({ title, icon, color, tasks, empty }: { title: string; icon: React.ReactNode; color: string; tasks: Task[]; empty: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? tasks : tasks.slice(0, LIMIT);
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 font-bold" style={{ color }}>
          {icon}
          {title}
        </div>
        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${color}18`, color }}>
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 p-1.5">
        {tasks.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted">{empty}</p>
        ) : (
          shown.map((t) => <TaskRow key={t.id} task={t} />)
        )}
      </div>
      {tasks.length > LIMIT && (
        <button onClick={() => setAll(!all)} className="border-t border-line px-4 py-2.5 text-sm font-medium text-brand-ink hover:bg-brand-soft/60">
          {all ? "הצג פחות" : `הצג עוד ${tasks.length - LIMIT}`}
        </button>
      )}
    </div>
  );
}
