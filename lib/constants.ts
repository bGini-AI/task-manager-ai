export const TIMEZONE = "Asia/Jerusalem";

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ["new", "in_progress", "on_hold", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const VIEWS = ["kanban", "todo", "calendar"] as const;
export type ViewType = (typeof VIEWS)[number];

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; soft: string; rank: number }
> = {
  low: { label: "נמוכה", color: "#64748b", soft: "#eef1f5", rank: 1 },
  medium: { label: "בינונית", color: "#2563eb", soft: "#e8f0fe", rank: 2 },
  high: { label: "גבוהה", color: "#ea580c", soft: "#fff0e4", rank: 3 },
  urgent: { label: "דחוף", color: "#dc2626", soft: "#fdeaea", rank: 4 },
};

export const STATUS_META: Record<
  Status,
  { label: string; color: string; soft: string }
> = {
  new: { label: "חדשה", color: "#0ea5e9", soft: "#e6f5fd" },
  in_progress: { label: "בעבודה", color: "#8b5cf6", soft: "#f0eafe" },
  on_hold: { label: "בהשהייה", color: "#d97706", soft: "#fdf3df" },
  done: { label: "הושלמה", color: "#16a34a", soft: "#e5f6ea" },
};

export const VIEW_META: Record<ViewType, { label: string; hint: string }> = {
  kanban: { label: "קנבן", hint: "עמודות לפי סטטוס עם גרירה" },
  todo: { label: "רשימת TODO", hint: "רשימה עם וי, לפי עדיפות" },
  calendar: { label: "לוח שנה", hint: "חודש שלם לפי תאריך יעד" },
};

export const SPACE_COLORS = [
  "#2f9e6e",
  "#3b6fe0",
  "#8b5cf6",
  "#e5484d",
  "#f08c1a",
  "#0ea5a4",
  "#d6409f",
  "#7a8b2f",
  "#5b6b8c",
  "#c2410c",
];

export const sortPriorityDesc = (a: Priority, b: Priority) =>
  PRIORITY_META[b].rank - PRIORITY_META[a].rank;
