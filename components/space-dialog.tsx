"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Columns3, ListChecks, Trash2 } from "lucide-react";
import clsx from "clsx";
import { SPACE_COLORS, VIEWS, VIEW_META, type ViewType } from "@/lib/constants";
import { useData } from "./data-provider";
import { Button, Field, Modal } from "./ui";

export const VIEW_ICON: Record<ViewType, typeof Columns3> = {
  kanban: Columns3,
  todo: ListChecks,
  calendar: CalendarDays,
};

export function SpaceDialog() {
  const { dialog, closeDialog, spaces } = useData();
  if (!dialog || dialog.kind !== "space") return null;
  if (dialog.spaceId && !spaces.find((s) => s.id === dialog.spaceId)) return null;
  return <SpaceForm key={dialog.spaceId ?? "new"} onClose={closeDialog} />;
}

function SpaceForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { dialog, spaces, tasks, createSpace, patchSpace, removeSpace } = useData();
  const existing = dialog?.kind === "space" && dialog.spaceId ? spaces.find((s) => s.id === dialog.spaceId) : undefined;

  const usedColors = new Set(spaces.map((s) => s.color));
  const firstFree = SPACE_COLORS.find((c) => !usedColors.has(c)) ?? SPACE_COLORS[0];

  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState(existing?.color ?? firstFree);
  const [view, setView] = useState<ViewType>(existing?.view ?? "kanban");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;
  const taskCount = existing ? tasks.filter((t) => t.space_id === existing.id).length : 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    if (existing) {
      await patchSpace(existing.id, { name: name.trim(), color, view });
      onClose();
    } else {
      const s = await createSpace({ name: name.trim(), color, view });
      onClose();
      if (s) router.push(`/spaces/${s.id}`);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "הגדרות מרחב" : "מרחב חדש"}
      footer={
        <>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {existing ? "שמירה" : "יצירת מרחב"}
          </Button>
          <Button onClick={onClose}>ביטול</Button>
          {existing && (
            <div className="ms-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">{taskCount > 0 ? `יימחקו גם ${taskCount} משימות.` : "למחוק?"}</span>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await removeSpace(existing.id);
                      onClose();
                      router.push("/");
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
                  מחיקת מרחב
                </Button>
              )}
            </div>
          )}
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="שם המרחב">
          <input
            className="input text-base font-medium"
            autoFocus
            placeholder="למשל: בית, עבודה, לימודים"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </Field>

        <Field label="צבע">
          <div className="flex flex-wrap gap-2.5">
            {SPACE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                className={clsx(
                  "flex size-8 items-center justify-center rounded-full transition hover:scale-110",
                  color === c && "ring-2 ring-offset-2",
                )}
                style={{ background: c, ["--tw-ring-color" as string]: c }}
              >
                {color === c && <Check className="size-4 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </Field>

        <Field label="תצוגה">
          <div className="grid gap-2.5 sm:grid-cols-3">
            {VIEWS.map((v) => {
              const Icon = VIEW_ICON[v];
              const active = view === v;
              return (
                <button
                  type="button"
                  key={v}
                  onClick={() => setView(v)}
                  className={clsx(
                    "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-start transition",
                    active ? "border-transparent shadow-card ring-2" : "border-line-strong bg-white hover:bg-bg",
                  )}
                  style={active ? { background: `${color}12`, ["--tw-ring-color" as string]: color } : undefined}
                >
                  <Icon className="size-5" style={{ color: active ? color : "#667085" }} />
                  <span className="text-sm font-bold">{VIEW_META[v].label}</span>
                  <span className="text-xs leading-snug text-muted">{VIEW_META[v].hint}</span>
                </button>
              );
            })}
          </div>
          {existing && <p className="mt-2 text-xs text-muted">אפשר להחליף תצוגה בכל רגע, המשימות נשארות כמו שהן.</p>}
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
