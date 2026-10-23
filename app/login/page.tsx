"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      setError(res.status === 401 ? "הסיסמה שגויה, נסה שוב" : "משהו השתבש, נסה שוב");
    } catch {
      setError("אין חיבור לשרת, נסה שוב");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm animate-pop">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-brand text-white shadow-pop">
            <CheckCheck className="size-7" strokeWidth={2.6} />
          </div>
          <h1 className="text-2xl font-bold">מנהל המשימות</h1>
          <p className="text-sm text-muted">המרחב האישי שלך, עם סוכן AI שעובד בשבילך</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <label htmlFor="pw" className="mb-2 block text-sm font-medium">
            סיסמת כניסה
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              id="pw"
              type="password"
              autoFocus
              autoComplete="current-password"
              className="input ps-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="הקלד סיסמה"
            />
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={!password || busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-medium text-white transition hover:bg-brand-ink disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            כניסה
          </button>
        </form>
      </div>
    </main>
  );
}
