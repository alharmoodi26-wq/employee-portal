// Standardize Staff Passport names against Birthday Monitoring (source of truth).
//
// For every staffPassports record, find the ONE confident Birthday record for
// that employee and replace the passport's `name` with the EXACT Birthday name.
//
//   • Matching ignores capitalization, commas, punctuation, extra spaces,
//     middle names, name order and Jr/Jr. (token-set based).
//   • Passport-style "LASTNAME, First Middle" is handled (order-independent).
//   • Only the `name` field is written. Nothing else is touched.
//   • Ambiguous / uncertain matches are skipped (left unchanged).
//   • Idempotent: records already equal to their Birthday name are skipped.
//
// Dry-run (report only):   node scripts/standardize-passport-names.mjs
// Apply changes:           APPLY=1 node scripts/standardize-passport-names.mjs

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
} from "firebase/firestore";

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

// Same normalization used by the UI photo matcher (fsNormalizeName).
const norm = (name) =>
  String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Build a Birthday name index: exact-normalized lookup + token entries.
function buildBirthdayIndex(birthdays) {
  const byExact = new Map(); // norm -> exact birthday name
  const entries = []; // { tokens, name }
  for (const b of birthdays) {
    const n = norm(b.name);
    if (!n) continue;
    if (!byExact.has(n)) byExact.set(n, b.name);
    entries.push({ tokens: n.split(" ").filter(Boolean), name: b.name });
  }
  return { byExact, entries };
}

// Resolve a passport name to the ONE confident Birthday name, or "" if none.
function matchBirthdayName(index, passportName) {
  const n = norm(passportName);
  if (!n) return "";
  const exact = index.byExact.get(n);
  if (exact) return exact;

  const pTokens = n.split(" ").filter(Boolean);
  if (pTokens.length < 2) return ""; // too little to match confidently
  const pSet = new Set(pTokens);

  // Confident candidates: ≥2 shared tokens AND one name is a subset of the
  // other (handles middle names + reversed passport order).
  const candidates = [];
  for (const e of index.entries) {
    const eSet = new Set(e.tokens);
    let overlap = 0;
    for (const t of pSet) if (eSet.has(t)) overlap += 1;
    const subset =
      pTokens.every((t) => eSet.has(t)) || e.tokens.every((t) => pSet.has(t));
    if (overlap >= 2 && subset) candidates.push(e);
  }
  if (candidates.length === 0) return "";

  // Same person iff every candidate is a subset of the fullest name among them.
  let fullest = candidates[0];
  for (const c of candidates) if (c.tokens.length > fullest.tokens.length) fullest = c;
  const fSet = new Set(fullest.tokens);
  const samePerson = candidates.every((c) => c.tokens.every((t) => fSet.has(t)));
  return samePerson ? fullest.name : "";
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

  const updates = []; // { id, from, to }
  const alreadyOk = []; // already equal to birthday name
  const unmatched = []; // no confident birthday match

  for (const p of passports) {
    const bdName = matchBirthdayName(index, p.name);
    if (!bdName) {
      unmatched.push(p.name);
      continue;
    }
    if (bdName === p.name) {
      alreadyOk.push(p.name);
      continue;
    }
    updates.push({ id: p.id, from: p.name, to: bdName });
  }

  console.log(`Birthday records: ${birthdays.length}`);
  console.log(`Passport records: ${passports.length}`);
  console.log(`Matched to a Birthday name: ${updates.length + alreadyOk.length}`);
  console.log(`  • Will be renamed:  ${updates.length}`);
  console.log(`  • Already correct:  ${alreadyOk.length}`);
  console.log(`Not confidently matched (left unchanged): ${unmatched.length}`);
  console.log("");
  console.log("── Proposed renames ─────────────────────────────");
  for (const u of updates) console.log(`  "${u.from}"  →  "${u.to}"`);
  console.log("");
  console.log("── Not matched ──────────────────────────────────");
  for (const n of unmatched) console.log(`  ${n}`);
  console.log("");

  if (!APPLY) {
    console.log("DRY-RUN only. Re-run with  APPLY=1  to write these changes.");
    process.exit(0);
  }

  // Apply — write ONLY the name field (merge) in batches of 400.
  let written = 0;
  for (let i = 0; i < updates.length; i += 400) {
    const batch = writeBatch(db);
    for (const u of updates.slice(i, i + 400)) {
      batch.set(doc(db, "staffPassports", u.id), { name: u.to }, { merge: true });
      written += 1;
    }
    await batch.commit();
  }
  console.log(`APPLIED: ${written} passport name(s) updated.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
