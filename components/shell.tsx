"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCheck, LayoutDashboard, LogOut, Menu, Plus, X } from "lucide-react";
import clsx from "clsx";
import { isOpen } from "@/lib/selectors";
import { ChatWidget } from "./chat";
import { DataProvider, useData } from "./data-provider";
import { SpaceDialog } from "./space-dialog";
import { TaskDialog } from "./task-dialog";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <ShellInner>{children}</ShellInner>
    </DataProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh lg:flex">
      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button aria-label="תפריט" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-bg">
          <Menu className="size-5" />
        </button>
      </div>

      {/* overlay for mobile drawer */}
      {open && <div className="fixed inset-0 z-40 animate-fade bg-[#0f172a]/45 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={clsx(
          "fixed inset-y-0 start-0 z-50 flex w-72 flex-col border-e border-line bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:z-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "max-lg:translate-x-full",
        )}
      >
        <Sidebar onClose={() => setOpen(false)} />
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pt-8">{children}</main>

      <TaskDialog />
      <SpaceDialog />
      <ChatWidget />
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-brand text-white">
        <CheckCheck className="size-5" strokeWidth={2.6} />
      </div>
      <span className="text-lg font-bold">מנהל המשימות</span>
    </div>
  );
}

function Sidebar({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { spaces, tasks, openSpace } = useData();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 pb-3 pt-5">
        <Brand />
        <div className="flex items-center gap-0.5">
          <button onClick={logout} title="יציאה" aria-label="יציאה" className="rounded-lg p-2 text-muted hover:bg-bg hover:text-ink">
            <LogOut className="size-4" />
          </button>
          <button onClick={onClose} aria-label="סגירה" className="rounded-lg p-2 text-muted hover:bg-bg lg:hidden">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-28 pt-2">
        <NavLink href="/" active={pathname === "/"} icon={<LayoutDashboard className="size-[18px]" />}>
          דשבורד
        </NavLink>

        <div className="flex items-center justify-between px-3 pb-1 pt-5">
          <span className="text-xs font-bold tracking-wide text-faint">המרחבים</span>
          <button
            onClick={() => openSpace()}
            aria-label="מרחב חדש"
            title="מרחב חדש"
            className="rounded-md p-1 text-muted transition hover:bg-bg hover:text-ink"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {spaces.map((s) => {
          const count = tasks.filter((t) => t.space_id === s.id && isOpen(t)).length;
          const active = pathname === `/spaces/${s.id}`;
          return (
            <NavLink
              key={s.id}
              href={`/spaces/${s.id}`}
              active={active}
              color={s.color}
              icon={<span className="mx-[3px] size-3 rounded-full" style={{ background: s.color }} />}
              badge={count}
            >
              {s.name}
            </NavLink>
          );
        })}

        <button
          onClick={() => openSpace()}
          className="mt-1 flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-muted transition hover:border-brand hover:bg-brand-soft/50 hover:text-brand-ink"
        >
          <Plus className="size-[18px]" />
          מרחב חדש
        </button>
      </nav>
    </>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
  badge,
  color,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: number;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition",
        active ? "text-ink" : "text-muted hover:bg-bg hover:text-ink",
      )}
      style={active ? { background: color ? `${color}16` : "var(--color-brand-soft)" } : undefined}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {badge !== undefined && badge > 0 && <span className="text-xs text-faint">{badge}</span>}
    </Link>
  );
}
