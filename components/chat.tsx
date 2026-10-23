"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Check, ChevronDown, Layers, Loader2, RotateCcw, ShieldQuestion, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import type { ChatMessage, Scope } from "@/lib/types";
import { useData } from "./data-provider";

const STORAGE_KEY = "tm_chat_v1";
const uid = () => Math.random().toString(36).slice(2, 10);

/* ----------------------------- tiny markdown ----------------------------- */

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(
      tok.startsWith("**") ? (
        <strong key={i++} className="font-bold">
          {tok.slice(2, -2)}
        </strong>
      ) : (
        <code key={i++} className="rounded bg-black/5 px-1 py-0.5 text-[0.9em]">
          {tok.slice(1, -1)}
        </code>
      ),
    );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*([-*•])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•])\s+/, ""));
      blocks.push(
        <ul key={key++} className="my-1 list-disc space-y-0.5 ps-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>,
      );
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={key++} className="my-1 list-decimal space-y-0.5 ps-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ol>,
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      blocks.push(
        <p key={key++} className="my-1 first:mt-0 last:mb-0">
          {inline(line)}
        </p>,
      );
      i++;
    }
  }
  return <>{blocks}</>;
}

/* --------------------------------- widget -------------------------------- */

export function ChatWidget() {
  const { spaces, refresh, loaded } = useData();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // scope: automatic from the route, overridable per-route
  const match = pathname.match(/^\/spaces\/([^/]+)/);
  const autoScope: Scope = match && spaces.some((s) => s.id === match[1]) ? { type: "space", spaceId: match[1] } : { type: "all" };
  const [override, setOverride] = useState<{ path: string; scope: Scope } | null>(null);
  const scope: Scope = override && override.path === pathname ? override.scope : autoScope;
  const isManual = !!override && override.path === pathname;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        // pending approvals do not survive a reload
        setMessages(parsed.map((m) => (m.pending && m.pendingState === "open" ? { ...m, pendingState: "expired" as const } : m)));
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    } catch {}
  }, [messages, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const push = useCallback((m: Omit<ChatMessage, "id">) => setMessages((prev) => [...prev, { ...m, id: uid() }]), []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      const history = [...messages, { id: "x", role: "user" as const, content: text }];
      setMessages((prev) => [
        ...prev.map((m) => (m.pending && m.pendingState === "open" ? { ...m, pendingState: "expired" as const } : m)),
        { id: uid(), role: "user", content: text },
      ]);
      setBusy(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            scope,
          }),
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          push({ role: "assistant", content: data.error ?? "משהו השתבש, נסה שוב.", error: true });
        } else {
          push({
            role: "assistant",
            content: data.reply,
            mutated: data.mutated,
            pending: data.pending,
            pendingState: data.pending ? "open" : undefined,
          });
          if (data.mutated) await refresh();
        }
      } catch {
        push({ role: "assistant", content: "אין חיבור לשרת כרגע. נסה שוב.", error: true });
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, scope, push, refresh],
  );

  const decide = useCallback(
    async (msg: ChatMessage, approve: boolean) => {
      if (!msg.pending || busy) return;
      setBusy(true);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, pendingState: approve ? "approved" : "rejected" } : m)));
      try {
        const res = await fetch("/api/chat/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionId: msg.pending.id, approve }),
        });
        const data = await res.json();
        push({ role: "assistant", content: res.ok ? data.reply : (data.error ?? "הפעולה נכשלה."), mutated: data.mutated, error: !res.ok });
        if (res.ok && data.mutated) await refresh();
      } catch {
        push({ role: "assistant", content: "אין חיבור לשרת כרגע. נסה שוב.", error: true });
      } finally {
        setBusy(false);
      }
    },
    [busy, push, refresh],
  );

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  const scopeName = scope.type === "all" ? "כל המרחבים" : (spaces.find((s) => s.id === scope.spaceId)?.name ?? "מרחב");
  const suggestions =
    scope.type === "all"
      ? ["מה המשימות הכי חשובות שצריך לתת להן עדיפות?", "מה באיחור?", "תדחה את כל מה שבאיחור למחר", "תסכם לי את המצב בכל המרחבים"]
      : ["מה המשימות הכי חשובות שצריך לתת להן עדיפות?", "מה באיחור?", "תסכם לי את המרחב הזה", "תוסיף משימה: "];

  return (
    <>
      {/* floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="פתיחת צ'אט עם הסוכן"
          className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-gradient-to-br from-[#4f63f0] to-[#7c3aed] py-3 pe-5 ps-4 text-white shadow-[0_10px_30px_-6px_rgba(79,99,240,0.65)] transition hover:scale-[1.04] active:scale-95"
        >
          <span className="relative flex size-7 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/30 [animation-duration:2.6s]" />
            <Sparkles className="relative size-[22px]" />
          </span>
          <span className="text-[15px] font-bold">דבר עם הסוכן</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="צ'אט עם סוכן המשימות"
          className="animate-pop fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(740px,calc(100dvh-40px))] sm:w-[420px] sm:rounded-3xl sm:border sm:border-line sm:shadow-pop"
        >
          {/* header */}
          <div className="flex items-center gap-3 bg-gradient-to-br from-[#4457e6] to-[#7c3aed] px-4 py-3.5 text-white">
            <div className="flex size-10 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold leading-tight">סוכן המשימות</div>
              <div className="flex items-center gap-1.5 text-xs text-white/85">
                <span className="size-1.5 rounded-full bg-emerald-300" />
                מחובר · עונה בעברית
              </div>
            </div>
            <button
              onClick={() => {
                setMessages([]);
                setInput("");
              }}
              disabled={messages.length === 0}
              title="שיחה חדשה"
              aria-label="שיחה חדשה"
              className="rounded-lg p-2 text-white/85 transition hover:bg-white/15 disabled:opacity-40"
            >
              <RotateCcw className="size-[18px]" />
            </button>
            <button onClick={() => setOpen(false)} aria-label="סגירה" className="rounded-lg p-2 text-white/85 transition hover:bg-white/15">
              <X className="size-5" />
            </button>
          </div>

          {/* scope */}
          <ScopeBar
            scope={scope}
            scopeName={scopeName}
            isManual={isManual}
            onChange={(s) => setOverride({ path: pathname, scope: s })}
            onReset={() => setOverride(null)}
            disabled={!loaded}
          />

          {/* messages */}
          <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto bg-bg/60 px-4 py-4">
            {messages.length === 0 && (
              <div className="animate-fade pt-3 text-center">
                <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                  <Sparkles className="size-7" />
                </div>
                <h3 className="text-lg font-bold">איך אפשר לעזור?</h3>
                <p className="mx-auto mt-1 max-w-72 text-sm text-muted">
                  אני יכול לענות על שאלות, להוסיף, לעדכן, למחוק ולסכם משימות
                  {scope.type === "space" ? ` במרחב "${scopeName}"` : " בכל המרחבים"}.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => (s.endsWith(": ") ? (setInput(s), inputRef.current?.focus()) : send(s))}
                      className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-start text-sm text-ink shadow-card transition hover:border-brand/50 hover:bg-brand-soft/50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <Fragment key={m.id}>
                <Bubble msg={m} busy={busy} onDecide={decide} />
              </Fragment>
            ))}

            {busy && (
              <div className="flex animate-fade items-center gap-2.5">
                <Avatar />
                <div className="flex items-center gap-1.5 rounded-2xl rounded-es-md border border-line bg-surface px-4 py-3 shadow-card">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-2 rounded-full bg-brand" style={{ animation: `bounce-dot 1.2s ${i * 0.15}s infinite ease-in-out` }} />
                  ))}
                  <span className="ms-1 text-xs text-muted">הסוכן עובד על זה…</span>
                </div>
              </div>
            )}
          </div>

          {/* composer */}
          <div className="border-t border-line bg-surface p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-white p-1.5 transition focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
              <textarea
                ref={inputRef}
                dir="auto"
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={onKey}
                placeholder="שאל או בקש משהו…"
                className="max-h-[120px] min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] outline-none placeholder:text-faint"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || busy}
                aria-label="שליחה"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition hover:bg-brand-ink disabled:bg-line-strong"
              >
                {busy ? <Loader2 className="size-[18px] animate-spin" /> : <ArrowUp className="size-5" strokeWidth={2.6} />}
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-faint">הסוכן פועל רק על: {scopeName} · Enter לשליחה</p>
          </div>
        </div>
      )}
    </>
  );
}

function Avatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center self-end rounded-full bg-gradient-to-br from-[#4457e6] to-[#7c3aed] text-white">
      <Sparkles className="size-4" />
    </div>
  );
}

function Bubble({ msg, busy, onDecide }: { msg: ChatMessage; busy: boolean; onDecide: (m: ChatMessage, approve: boolean) => void }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-start">
        <div dir="auto" className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ss-md bg-brand px-3.5 py-2.5 text-[15px] leading-relaxed text-white shadow-card">
          {msg.content}
        </div>
      </div>
    );
  }
  const p = msg.pending;
  return (
    <div className="flex animate-fade gap-2.5">
      <Avatar />
      <div className="min-w-0 max-w-[88%]">
        <div
          dir="auto"
          className={clsx(
            "rounded-2xl rounded-es-md border px-3.5 py-2.5 text-[15px] leading-relaxed shadow-card",
            msg.error ? "border-red-200 bg-red-50 text-red-800" : "border-line bg-surface",
          )}
        >
          {p ? <Markdown text={msg.content.split("\n")[0]} /> : <Markdown text={msg.content} />}
          {msg.mutated && !p && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <Check className="size-3" /> המסך עודכן
            </div>
          )}
        </div>

        {p && (
          <div className="mt-2 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 shadow-card">
            <div className="flex items-center gap-2 border-b border-amber-200/70 px-3.5 py-2 text-sm font-bold text-amber-900">
              <ShieldQuestion className="size-4" />
              נדרש אישור · {p.total} משימות
            </div>
            <div className="max-h-44 space-y-2.5 overflow-y-auto px-3.5 py-2.5">
              {p.steps.map((s, i) => (
                <div key={i}>
                  <div className="text-sm font-medium text-amber-950">{s.label}</div>
                  <ul className="mt-1 space-y-0.5 text-[13px] text-amber-900/80">
                    {s.samples.map((t, j) => (
                      <li key={j} className="flex gap-1.5">
                        <Layers className="mt-0.5 size-3 shrink-0 opacity-60" />
                        <span className="truncate">{t}</span>
                      </li>
                    ))}
                    {s.count > s.samples.length && <li className="ps-4 text-xs">ועוד {s.count - s.samples.length}…</li>}
                  </ul>
                </div>
              ))}
            </div>
            <div className="border-t border-amber-200/70 px-3.5 py-2.5">
              {msg.pendingState === "open" ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => onDecide(msg, true)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="size-4" strokeWidth={3} />
                    מאשר
                  </button>
                  <button
                    onClick={() => onDecide(msg, false)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-white py-2 text-sm font-bold text-ink transition hover:bg-bg disabled:opacity-50"
                  >
                    <X className="size-4" />
                    לא מאשר
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm font-medium text-amber-900/80">
                  {msg.pendingState === "approved" && (
                    <>
                      <Check className="size-4 text-emerald-600" /> אושר
                    </>
                  )}
                  {msg.pendingState === "rejected" && (
                    <>
                      <X className="size-4 text-red-600" /> לא אושר
                    </>
                  )}
                  {msg.pendingState === "expired" && <>הבקשה בוטלה</>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScopeBar({
  scope,
  scopeName,
  isManual,
  onChange,
  onReset,
  disabled,
}: {
  scope: Scope;
  scopeName: string;
  isManual: boolean;
  onChange: (s: Scope) => void;
  onReset: () => void;
  disabled: boolean;
}) {
  const { spaces } = useData();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const space = scope.type === "space" ? spaces.find((s) => s.id === scope.spaceId) : undefined;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const options = useMemo(() => [{ id: "all", name: "כל המרחבים", color: "" }, ...spaces.map((s) => ({ id: s.id, name: s.name, color: s.color }))], [spaces]);

  return (
    <div ref={ref} className="relative z-10 border-b border-line bg-surface px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">הסוכן עובד עכשיו על:</span>
        <button
          onClick={() => setOpen(!open)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white py-1 pe-2 ps-3 font-bold transition hover:border-brand/60 hover:bg-brand-soft/40"
        >
          {space ? <span className="size-2.5 rounded-full" style={{ background: space.color }} /> : <Layers className="size-3.5 text-brand" />}
          {scopeName}
          <ChevronDown className={clsx("size-4 text-muted transition", open && "rotate-180")} />
        </button>
        {isManual && (
          <button onClick={onReset} className="text-xs text-brand-ink hover:underline">
            איפוס
          </button>
        )}
      </div>
      {open && (
        <div role="listbox" className="animate-pop absolute start-4 top-full mt-1 w-60 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop">
          {options.map((o) => {
            const active = o.id === "all" ? scope.type === "all" : scope.type === "space" && scope.spaceId === o.id;
            return (
              <button
                key={o.id}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.id === "all" ? { type: "all" } : { type: "space", spaceId: o.id });
                  setOpen(false);
                }}
                className={clsx("flex w-full items-center gap-2.5 px-3.5 py-2 text-start text-sm transition hover:bg-bg", active && "font-bold")}
              >
                {o.color ? <span className="size-2.5 rounded-full" style={{ background: o.color }} /> : <Layers className="size-3.5 text-brand" />}
                <span className="flex-1 truncate">{o.name}</span>
                {active && <Check className="size-4 text-brand" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
