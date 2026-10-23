"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import clsx from "clsx";
import {
  PRIORITIES,
  PRIORITY_META,
  STATUSES,
  STATUS_META,
  type Priority,
  type Status,
} from "@/lib/constants";
import { addDays, longDate } from "@/lib/dates";
import { useData } from "./data-provider";
import { Button, Field, Modal } from "./ui";

export function TaskDialog() {
  const { dialog, closeDialog, tasks } = useData();
  if (!dialog || dialog.kind !== "task") return null;
  const task = dialog.taskId ? tasks.find((t) => t.id === dialog.taskId) : undefined;
  if (dialog.taskId && !task) return null;
  return <TaskForm key={dialog.taskId ?? "new"} onClose={closeDialog} />;
}

function TaskForm({ onClose }: { onClose: () => void }) {
  const { dialog, tasks, spaces, today, createTask, patchTask, removeTask } = useData();
  const existing = dialog?.kind === "task" && dialog.taskId ? tasks.find((t) => t.id === dialog.taskId) : undefined;
  const defaults = dialog?.kind === "task" ? dialog.defaults : undefined;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? defaults?.priority ?? "medium");
  const [status, setStatus] = useState<Status>(existing?.status ?? defaults?.status ?? "new");
  const [due, setDue] = useState<string>(existing?.due_date ?? defaults?.due_date ?? "");
  const [spaceId, setSpaceId] = useState<string>(existing?.space_id ?? defaults?.space_id ?? spaces[0]?.id ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing) titleRef.current?.focus();
  }, [existing]);

  const canSave = title.trim().length > 0 && !!spaceId && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const payload = {
      title: title.trim(),
      description,
      priority,
      status,
      due_date: due || null,
      space_id: spaceId,
    };
    if (existing) await patchTask(existing.id, payload);
    else await createTask(payload);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "עריכת משימה" : "משימה חדשה"}
      footer={
        <>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {existing ? "שמירה" : "יצירת משימה"}
          </Button>
          <Button onClick={onClose}>ביטול</Button>
          {existing && (
            <div className="ms-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">למחוק?</span>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await removeTask(existing.id);
                      onClose();
                    }}
                  >
                    כן, מחק
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                    לא
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" />
                  מחיקה
                </Button>
              )}
            </div>
          )}
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="כותרת">
          <input
            ref={titleRef}
            className="input text-base font-medium"
            placeholder="מה צריך לעשות?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
          />
        </Field>

        <Field label="עדיפות">
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => {
              const m = PRIORITY_META[p];
              const active = priority === p;
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPriority(p)}
                  className={clsx(
                    "rounded-xl border px-2 py-2 text-sm font-medium transition",
                    active ? "shadow-card" : "border-line-strong bg-white text-muted hover:bg-bg",
                  )}
                  style={active ? { background: m.soft, borderColor: m.color, color: m.color } : undefined}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="סטטוס">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUSES.map((s) => {
              const m = STATUS_META[s];
              const active = status === s;
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStatus(s)}
                  className={clsx(
                    "rounded-xl border px-2 py-2 text-sm font-medium transition",
                    active ? "shadow-card" : "border-line-strong bg-white text-muted hover:bg-bg",
                  )}
                  style={active ? { background: m.soft, borderColor: m.color, color: m.color } : undefined}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="תאריך יעד">
            <div className="relative">
              <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
              {due && (
                <button
                  type="button"
                  onClick={() => setDue("")}
                  aria-label="הסרת תאריך"
                  className="absolute end-9 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                ["היום", today],
                ["מחר", addDays(today, 1)],
                ["בעוד שבוע", addDays(today, 7)],
              ].map(([label, d]) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => setDue(d)}
                  className={clsx(
                    "rounded-full border px-2.5 py-0.5 text-xs transition",
                    due === d ? "border-brand bg-brand-soft text-brand-ink" : "border-line-strong text-muted hover:bg-bg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {due && <p className="mt-1.5 text-xs text-muted">{longDate(due)}</p>}
          </Field>

          <Field label="מרחב">
            <div className="relative">
              <span
                className="pointer-events-none absolute start-3 top-1/2 size-3 -translate-y-1/2 rounded-full"
                style={{ background: spaces.find((s) => s.id === spaceId)?.color }}
              />
              <select className="input ps-8" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>

        <Field label="תיאור">
          <textarea
            className="input min-h-24 resize-y"
            placeholder="פרטים, הערות, קישורים…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
