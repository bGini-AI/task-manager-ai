"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Priority, Status, ViewType } from "@/lib/constants";
import { todayStr } from "@/lib/dates";
import type { Bootstrap, Space, Task } from "@/lib/types";

export interface TaskDefaults {
  space_id?: string;
  due_date?: string | null;
  status?: Status;
  priority?: Priority;
}

type Dialog =
  | { kind: "task"; taskId?: string; defaults?: TaskDefaults }
  | { kind: "space"; spaceId?: string }
  | null;

interface DataCtx {
  loaded: boolean;
  error: boolean;
  spaces: Space[];
  tasks: Task[];
  today: string;
  dashboardSpaces: string[] | null;
  dialog: Dialog;
  openTask: (taskId: string) => void;
  newTask: (defaults?: TaskDefaults) => void;
  openSpace: (spaceId?: string) => void;
  closeDialog: () => void;
  refresh: () => Promise<void>;
  createTask: (input: Partial<Task> & { space_id: string; title: string }) => Promise<Task | null>;
  patchTask: (id: string, patch: Partial<Task>) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  createSpace: (input: { name: string; color: string; view: ViewType }) => Promise<Space | null>;
  patchSpace: (id: string, patch: Partial<Pick<Space, "name" | "color" | "view">>) => Promise<void>;
  removeSpace: (id: string) => Promise<void>;
  setDashboardSpaces: (ids: string[] | null) => void;
}

const Ctx = createContext<DataCtx | null>(null);

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData outside provider");
  return c;
}

async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`request failed ${res.status}`);
  return res.json();
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [today, setToday] = useState(todayStr());
  const dataRef = useRef<Bootstrap | null>(null);
  dataRef.current = data;

  const refresh = useCallback(async () => {
    try {
      const d = await api<Bootstrap>("/api/bootstrap", "GET");
      setData(d);
      setError(false);
    } catch {
      if (!dataRef.current) setError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    const tick = setInterval(() => setToday(todayStr()), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(tick);
    };
  }, [refresh]);

  const mutate = useCallback((fn: (d: Bootstrap) => Bootstrap) => {
    setData((d) => (d ? fn(d) : d));
  }, []);

  const createTask: DataCtx["createTask"] = useCallback(
    async (input) => {
      try {
        const t = await api<Task>("/api/tasks", "POST", input);
        mutate((d) => ({ ...d, tasks: [...d.tasks, t] }));
        return t;
      } catch {
        await refresh();
        return null;
      }
    },
    [mutate, refresh],
  );

  const patchTask: DataCtx["patchTask"] = useCallback(
    async (id, patch) => {
      const now = new Date().toISOString();
      mutate((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                ...patch,
                completed_at:
                  patch.status && patch.status !== t.status
                    ? patch.status === "done"
                      ? now
                      : null
                    : t.completed_at,
              }
            : t,
        ),
      }));
      try {
        const { id: _i, created_at: _c, updated_at: _u, completed_at: _ca, ...sendable } = patch as Task;
        const t = await api<Task>(`/api/tasks/${id}`, "PATCH", sendable);
        mutate((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === id ? t : x)) }));
      } catch {
        await refresh();
      }
    },
    [mutate, refresh],
  );

  const removeTask: DataCtx["removeTask"] = useCallback(
    async (id) => {
      mutate((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
      try {
        await api(`/api/tasks/${id}`, "DELETE");
      } catch {
        await refresh();
      }
    },
    [mutate, refresh],
  );

  const createSpace: DataCtx["createSpace"] = useCallback(
    async (input) => {
      try {
        const s = await api<Space>("/api/spaces", "POST", input);
        mutate((d) => ({ ...d, spaces: [...d.spaces, s] }));
        return s;
      } catch {
        return null;
      }
    },
    [mutate],
  );

  const patchSpace: DataCtx["patchSpace"] = useCallback(
    async (id, patch) => {
      mutate((d) => ({ ...d, spaces: d.spaces.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
      try {
        await api(`/api/spaces/${id}`, "PATCH", patch);
      } catch {
        await refresh();
      }
    },
    [mutate, refresh],
  );

  const removeSpace: DataCtx["removeSpace"] = useCallback(
    async (id) => {
      mutate((d) => ({
        ...d,
        spaces: d.spaces.filter((s) => s.id !== id),
        tasks: d.tasks.filter((t) => t.space_id !== id),
        dashboardSpaces: d.dashboardSpaces ? d.dashboardSpaces.filter((x) => x !== id) : null,
      }));
      try {
        await api(`/api/spaces/${id}`, "DELETE");
      } catch {
        await refresh();
      }
    },
    [mutate, refresh],
  );

  const setDashboardSpaces = useCallback(
    (ids: string[] | null) => {
      mutate((d) => ({ ...d, dashboardSpaces: ids }));
      api("/api/settings", "PUT", { dashboardSpaces: ids }).catch(() => {});
    },
    [mutate],
  );

  const value = useMemo<DataCtx>(
    () => ({
      loaded: !!data,
      error,
      spaces: data?.spaces ?? [],
      tasks: data?.tasks ?? [],
      today,
      dashboardSpaces: data?.dashboardSpaces ?? null,
      dialog,
      openTask: (taskId) => setDialog({ kind: "task", taskId }),
      newTask: (defaults) => setDialog({ kind: "task", defaults }),
      openSpace: (spaceId) => setDialog({ kind: "space", spaceId }),
      closeDialog: () => setDialog(null),
      refresh,
      createTask,
      patchTask,
      removeTask,
      createSpace,
      patchSpace,
      removeSpace,
      setDashboardSpaces,
    }),
    [data, error, today, dialog, refresh, createTask, patchTask, removeTask, createSpace, patchSpace, removeSpace, setDashboardSpaces],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
