import { PRIORITY_META } from "./constants";
import { weekStartInstant } from "./dates";
import type { Task } from "./types";

export const isOpen = (t: Task) => t.status !== "done";
export const isOverdue = (t: Task, today: string) =>
  isOpen(t) && !!t.due_date && t.due_date < today;
export const isDueToday = (t: Task, today: string) => isOpen(t) && t.due_date === today;

export function byImportance(a: Task, b: Task): number {
  return (
    PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank ||
    (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99") ||
    a.position - b.position
  );
}

export function spaceStats(tasks: Task[], spaceId: string, today: string) {
  const mine = tasks.filter((t) => t.space_id === spaceId);
  const weekStart = new Date(weekStartInstant(today)).getTime();
  return {
    open: mine.filter(isOpen).length,
    overdue: mine.filter((t) => isOverdue(t, today)).length,
    doneThisWeek: mine.filter(
      (t) => t.status === "done" && t.completed_at && new Date(t.completed_at).getTime() >= weekStart,
    ).length,
  };
}
