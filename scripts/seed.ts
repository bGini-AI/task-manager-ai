import "dotenv/config";
import { pool, ensureSchema } from "../lib/db";
import { addDays, todayStr } from "../lib/dates";

type Seed = {
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "new" | "in_progress" | "on_hold" | "done";
  due: number | null; // days from today
  description?: string;
};

const today = todayStr();

const SPACES: { name: string; color: string; view: "kanban" | "todo" | "calendar"; tasks: Seed[] }[] = [
  {
    name: "בית",
    color: "#2f9e6e",
    view: "todo",
    tasks: [
      { title: "לקנות חלב וביצים", priority: "medium", status: "new", due: 0 },
      { title: "להתקשר לסבתא", priority: "high", status: "new", due: 1, description: "לשאול איך היא מרגישה ולתאם ביקור לשבת." },
      { title: "לשלם ארנונה", priority: "urgent", status: "new", due: -1, description: "אפשר לשלם באתר העירייה." },
      { title: "לתקן את הברז במטבח", priority: "medium", status: "in_progress", due: 5 },
      { title: "לשלם חשבון חשמל", priority: "low", status: "done", due: -1 },
    ],
  },
  {
    name: "עבודה",
    color: "#3b6fe0",
    view: "kanban",
    tasks: [
      { title: "להכין מצגת לפגישת הנהלה", priority: "urgent", status: "in_progress", due: 0, description: "5 שקפים: מטרות, תוצאות, צעדים הבאים." },
      { title: "לשלוח הצעת מחיר ללקוח", priority: "high", status: "new", due: 1 },
      { title: "לסכם פגישת צוות שבועית", priority: "medium", status: "in_progress", due: -2 },
      { title: "לבדוק דוח הוצאות רבעוני", priority: "high", status: "new", due: 4 },
      { title: "לעדכן את תהליך הקליטה של עובדים", priority: "low", status: "on_hold", due: 10 },
      { title: "להשיב למיילים של לקוחות", priority: "medium", status: "done", due: 0 },
    ],
  },
  {
    name: "לימודים",
    color: "#8b5cf6",
    view: "calendar",
    tasks: [
      { title: "להגיש עבודה בסטטיסטיקה", priority: "urgent", status: "in_progress", due: 2 },
      { title: "ללמוד למבחן באלגברה", priority: "high", status: "new", due: 7, description: "פרקים 1-6, לפתור מבחני שנים קודמות." },
      { title: "לקרוא פרקים 4-5 בספר", priority: "medium", status: "new", due: -1 },
      { title: "לפתור תרגיל בית 6", priority: "medium", status: "new", due: 3 },
      { title: "לקבוע פגישה עם המרצה", priority: "low", status: "on_hold", due: 5 },
    ],
  },
];

async function main() {
  await ensureSchema();
  const force = process.argv.includes("--force");
  const { rows } = await pool().query("SELECT count(*)::int AS n FROM tm_spaces");
  if (rows[0].n > 0 && !force) {
    console.log(`כבר יש ${rows[0].n} מרחבים - מדלג על הזנת נתוני דוגמה (להרצה מחדש: --force)`);
    await pool().end();
    return;
  }
  if (force) await pool().query("DELETE FROM tm_spaces");

  let pos = 1;
  for (const [i, sp] of SPACES.entries()) {
    const res = await pool().query(
      "INSERT INTO tm_spaces (name, color, view, position) VALUES ($1,$2,$3,$4) RETURNING id",
      [sp.name, sp.color, sp.view, i + 1],
    );
    const spaceId = res.rows[0].id;
    for (const t of sp.tasks) {
      await pool().query(
        `INSERT INTO tm_tasks (space_id, title, description, priority, status, due_date, completed_at, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          spaceId,
          t.title,
          t.description ?? "",
          t.priority,
          t.status,
          t.due === null ? null : addDays(today, t.due),
          t.status === "done" ? new Date(Date.now() - 2 * 3600 * 1000).toISOString() : null,
          pos++,
        ],
      );
    }
  }
  console.log(`נוספו ${SPACES.length} מרחבים ו-${SPACES.reduce((n, s) => n + s.tasks.length, 0)} משימות (תאריך בסיס ${today})`);
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
