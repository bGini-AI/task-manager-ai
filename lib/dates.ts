import { TIMEZONE } from "./constants";

/** YYYY-MM-DD of "now" in the app timezone */
export function todayStr(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA => YYYY-MM-DD
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** 0 = Sunday */
export function weekday(s: string): number {
  return parseDate(s).getUTCDay();
}

/** Start of the (Sunday-based) week containing s */
export function weekStart(s: string): string {
  return addDays(s, -weekday(s));
}

export function addMonths(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return fmt(d);
}

export const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
export const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function monthTitle(s: string): string {
  const d = parseDate(s);
  return `${HE_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function longDate(s: string): string {
  const d = parseDate(s);
  return `יום ${HE_DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ב${HE_MONTHS[d.getUTCMonth()]}`;
}

export function shortDate(s: string, today: string): string {
  if (s === today) return "היום";
  if (s === addDays(today, 1)) return "מחר";
  if (s === addDays(today, -1)) return "אתמול";
  const d = parseDate(s);
  const base = `${d.getUTCDate()} ב${HE_MONTHS[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === parseDate(today).getUTCFullYear()
    ? base
    : `${base} ${d.getUTCFullYear()}`;
}

/** The 6x7 (or 5x7) grid of dates for the month containing `anchor` */
export function monthGrid(anchor: string): string[] {
  const first = anchor.slice(0, 8) + "01";
  const start = weekStart(first);
  const d = parseDate(first);
  const daysInMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const last = addDays(first, daysInMonth - 1);
  const end = addDays(weekStart(last), 6);
  const out: string[] = [];
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

/** timestamp (ISO) of the start of the Sunday-week containing today in app tz */
export function weekStartInstant(today: string): string {
  // Approximate boundary: midnight UTC of the week-start date shifted by tz offset
  const ws = weekStart(today);
  const probe = new Date(`${ws}T12:00:00Z`);
  const offsetMin = tzOffsetMinutes(probe);
  return new Date(Date.parse(`${ws}T00:00:00Z`) - offsetMin * 60000).toISOString();
}

function tzOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - at.getTime()) / 60000);
}
