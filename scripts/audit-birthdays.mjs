// Audit the full Birthday Monitoring dataset with the corrected countdown logic.
// Simulates "today" so results are deterministic (default: 2026-08-11).
//   node scripts/audit-birthdays.mjs            (today = 2026-08-11)
//   TODAY=2026-02-27 node scripts/audit-birthdays.mjs

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, inMemoryPersistence, setPersistence } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const ADMIN_EMAIL = process.env.PORTAL_ADMIN_EMAIL || "Power@PS.com";
const ADMIN_PASSWORD = process.env.PORTAL_ADMIN_PASSWORD || "112233";
const TODAY = process.env.TODAY || "2026-08-11";

const firebaseConfig = {
  apiKey: "AIzaSyAvGYmS-itQi0KpYSxMRWHHKokwEPrU1mM",
  authDomain: "company-employee-system-hamad.firebaseapp.com",
  projectId: "company-employee-system-hamad",
  storageBucket: "company-employee-system-hamad.firebasestorage.app",
  messagingSenderId: "72654624885",
  appId: "1:72654624885:web:f5bd0c6dbd1f5eea92c03c",
};

// ── Helpers mirror app/admin-dashboard.tsx exactly ──
function parseBirthdayMD(bStr) {
  if (!bStr) return null;
  const m = String(bStr).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year: year || null, month, day };
  }
  const d = new Date(bStr);
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}
function birthdayInYear(month, day, year) {
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, lastDay));
}
function birthdayDaysUntil(bStr, todayStr) {
  const md = parseBirthdayMD(bStr);
  if (!md) return 999;
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  let target = birthdayInYear(md.month, md.day, today.getFullYear());
  if (target.getTime() < today.getTime()) target = birthdayInYear(md.month, md.day, today.getFullYear() + 1);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
const label = (days) => (days === 0 ? "TODAY 🎂" : days === 1 ? "in 1 day" : `in ${days} days`);

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await setPersistence(auth, inMemoryPersistence);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

  const snap = await getDocs(collection(db, "birthdays"));
  const list = [];
  snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

  const rows = list.map((b) => ({ name: b.name, raw: b.birthday, md: parseBirthdayMD(b.birthday), days: birthdayDaysUntil(b.birthday, TODAY) }));
  rows.sort((a, b) => a.days - b.days);

  console.log(`Simulated today: ${TODAY}   |   Birthday records: ${rows.length}\n`);

  const bad = rows.filter((r) => !r.md);
  console.log(`Records with unparseable dates: ${bad.length}`);
  bad.forEach((r) => console.log(`  ⚠ ${r.name} — "${r.raw}"`));
  console.log("");

  console.log("── Countdown (soonest first) ──");
  for (const r of rows) {
    const flag = r.days === 0 ? " ⬅ TODAY" : "";
    console.log(`  ${String(r.days).padStart(3)}  ${label(r.days).padEnd(12)}  ${r.name}  (${r.raw})${flag}`);
  }

  // Spot-checks from the request.
  console.log("\n── Spot checks ──");
  const check = (needle, expectDays) => {
    const r = rows.find((x) => x.name.toLowerCase().includes(needle.toLowerCase()));
    if (!r) return console.log(`  ? "${needle}" not found`);
    const ok = r.days === expectDays ? "PASS" : "FAIL";
    console.log(`  [${ok}] ${r.name}: ${label(r.days)} (expected ${label(expectDays)})`);
  };
  check("Ronnel Enriquez", 0);
  check("Catherine", 3);

  process.exit(0);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
