import type { Priority, Status, ViewType } from "./constants";

export interface Space {
  id: string;
  name: string;
  color: string;
  view: ViewType;
  position: number;
}

export interface Task {
  id: string;
  space_id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  due_date: string | null; // YYYY-MM-DD
  completed_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Bootstrap {
  spaces: Space[];
  tasks: Task[];
  dashboardSpaces: string[] | null;
  today: string;
}

export interface PendingAction {
  id: string;
  title: string;
  total: number;
  steps: { label: string; count: number; samples: string[] }[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mutated?: boolean;
  pending?: PendingAction;
  pendingState?: "open" | "approved" | "rejected" | "expired";
  error?: boolean;
}

export type Scope = { type: "all" } | { type: "space"; spaceId: string };
