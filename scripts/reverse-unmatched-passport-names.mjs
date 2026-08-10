// Fix ONLY the passport records that were NOT confidently matched to a Birthday
// name. For those, reverse the passport-style "LASTNAME, First Middle" format:
//   everything AFTER the comma  = first part
//   everything BEFORE the comma = last part  (title-cased)
//   → "NEZARI, Seyed Mohammad Reza"  →  "Seyed Mohammad Reza Nezari"
//
// The 72 already-standardized names are left untouched (they DO match a Birthday
// record, so they are skipped here). Only the `name` field is written.
//
// Dry-run:  node scripts/reverse-unmatched-passport-names.mjs
// Apply:    APPLY=1 node scripts/reverse-unmatched-passport-names.mjs

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";

const ADMIN_EMAIL = process.env.PORTAL_ADMIN_EMAIL || "Power@PS.com";
const ADMIN_PASSWORD = process.env.PORTAL_ADMIN_PASSWORD || "112233";
const APPLY = process.env.APPLY === "1";

const firebaseConfig = {
  apiKey: "AIzaSyAvGYmS-itQi0KpYSxMRWHHKokwEPrU1mM",
  authDomain: "company-employee-system-hamad.firebaseapp.com",
  projectId: "company-employee-system-hamad",
  storageBucket: "company-employee-system-hamad.firebasestorage.app",
  messagingSenderId: "72654624885",
  appId: "1:72654624885:web:f5bd0c6dbd1f5eea92c03c",
};

const norm = (name) =>
  String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Confident Birthday match (identical logic to the standardize script) — used
// only to identify which passports are the UNMATCHED ones we should reverse.
function buildBirthdayIndex(birthdays) {
  const byExact = new Map();
  const entries = [];
  for (const b of birthdays) {
    const n = norm(b.name);
    if (!n) continue;
    if (!byExact.has(n)) byExact.set(n, b.name);
    entries.push({ tokens: n.split(" ").filter(Boolean), name: b.name });
  }
  return { byExact, entries };
}
function matchBirthdayName(index, passportName) {
  const n = norm(passportName);
  if (!n) return "";
  if (index.byExact.get(n)) return index.byExact.get(n);
  const pTokens = n.split(" ").filter(Boolean);
  if (pTokens.length < 2) return "";
  const pSet = new Set(pTokens);
  const cands = [];
  for (const e of index.entries) {
    const eSet = new Set(e.tokens);
    let overlap = 0;
    for (const t of pSet) if (eSet.has(t)) overlap += 1;
    const subset = pTokens.every((t) => eSet.has(t)) || e.tokens.every((t) => pSet.has(t));
    if (overlap >= 2 && subset) cands.push(e);
  }
  if (!cands.length) return "";
  let fullest = cands[0];
  for (const c of cands) if (c.tokens.length > fullest.tokens.length) fullest = c;
  const fSet = new Set(fullest.tokens);
  return cands.every((c) => c.tokens.every((t) => fSet.has(t))) ? fullest.name : "";
}

// Title-case a surname chunk, preserving normal capitalization.
const titleCase = (s) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

// Reverse "LASTNAME, First Middle" -> "First Middle Lastname".
// The part after the comma keeps its existing (normal) capitalization; only the
// ALL-CAPS surname before the comma is title-cased.
function reverseName(name) {
  const idx = name.indexOf(",");
  if (idx === -1) return null; // no comma -> not passport-style, leave unchanged
  const before = name.slice(0, idx).trim(); // surname (ALL CAPS)
  const after = name.slice(idx + 1).trim(); // given names (normal case)
  if (!before || !after) return null;
  return `${after} ${titleCase(before)}`.replace(/\s+/g, " ").trim();
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await setPersistence(auth, inMemoryPersistence);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

  const [bdaySnap, passSnap] = await Promise.all([
    getDocs(collection(db, "birthdays")),
    getDocs(collection(db, "staffPassports")),
  ]);
  const birthdays = [];
  bdaySnap.forEach((d) => birthdays.push({ id: d.id, ...d.data() }));
  const passports = [];
  passSnap.forEach((d) => passports.push({ id: d.id, ...d.data() }));

  const index = buildBirthdayIndex(birthdays);

  const updates = [];
  const skippedMatched = []; // matched to a birthday -> DO NOT touch
  const skippedNoComma = []; // unmatched but no passport-style comma

  for (const p of passports) {
    if (matchBirthdayName(index, p.name)) {
      skippedMatched.push(p.name);
      continue;
    }
    const reversed = reverseName(p.name);
    if (!reversed || reversed === p.name) {
      skippedNoComma.push(p.name);
      continue;
    }
    updates.push({ id: p.id, from: p.name, to: reversed });
  }

  console.log(`Passport records: ${passports.length}`);
  console.log(`Matched to Birthday (untouched): ${skippedMatched.length}`);
  console.log(`Unmatched to reverse: ${updates.length}`);
  console.log("");
  console.log("── Reversals ────────────────────────────────────");
  for (const u of updates) console.log(`  "${u.from}"  →  "${u.to}"`);
  if (skippedNoComma.length) {
    console.log("");
    console.log("── Unmatched but skipped (no comma) ─────────────");
    for (const n of skippedNoComma) console.log(`  ${n}`);
  }
  console.log("");

  if (!APPLY) {
    console.log("DRY-RUN only. Re-run with  APPLY=1  to write these changes.");
    process.exit(0);
  }

  const batch = writeBatch(db);
  for (const u of updates) batch.set(doc(db, "staffPassports", u.id), { name: u.to }, { merge: true });
  await batch.commit();
  console.log(`APPLIED: ${updates.length} passport name(s) reversed.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
