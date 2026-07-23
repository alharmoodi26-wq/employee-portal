// Basic Food Safety Certificate — Bulk Importer (idempotent)
//
// Writes into the SAME Firestore collection used by the manual
// "Add Basic Food Safety Certificate" form:  foodSafetyCertifications
//
// Safe to run more than once:
//   • De-duplicates by Certificate ID (existing docs are read first).
//   • Never overwrites an existing record.
//   • Links each cert to an employee (users collection) by exact name match;
//     unmatched records are still imported and flagged employeeLinked:false.
//
// Usage:
//   1. (optional) export PORTAL_ADMIN_EMAIL / PORTAL_ADMIN_PASSWORD
//   2. node scripts/import-food-safety.mjs
//   3. Clear any credentials you added when done.

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
  serverTimestamp,
} from "firebase/firestore";

// ─── CREDENTIALS ─────────────────────────────────────────────────────────────
// Falls back to the same admin login used by scripts/import-ohc.mjs.
const ADMIN_EMAIL    = process.env.PORTAL_ADMIN_EMAIL    || "Power@PS.com";
const ADMIN_PASSWORD = process.env.PORTAL_ADMIN_PASSWORD || "112233";

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAvGYmS-itQi0KpYSxMRWHHKokwEPrU1mM",
  authDomain: "company-employee-system-hamad.firebaseapp.com",
  projectId: "company-employee-system-hamad",
  storageBucket: "company-employee-system-hamad.firebasestorage.app",
  messagingSenderId: "72654624885",
  appId: "1:72654624885:web:f5bd0c6dbd1f5eea92c03c",
};

// ─── DATA (25 records) ────────────────────────────────────────────────────────
const records = [
  { staffName: "Angelica Mendiola",                        certificateId: "BFS FS 5005557", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Belly Jay Malabuyoc",                      certificateId: "BFS FS 5005574", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Edmund Gillaco Mancay",                    certificateId: "BFS FS 5005576", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Emiric Bautista",                          certificateId: "BFS FS 5005558", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Garilyn Tolentino",                        certificateId: "BFS FS 5005560", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Keshab Dhungana",                          certificateId: "BFS FS 5005585", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Manilyn Antonio",                          certificateId: "BFS FS 5005579", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Marcelo Parreno",                          certificateId: "BFS FS 5005588", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Pelagio Balnaja Jr",                       certificateId: "BFS FS 5005604", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Ronnel Catapang Enriquez",                 certificateId: "BFS FS 5005545", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Alberto Jr Ballesteros",                   certificateId: "BFS FS 5005547", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Arshadul Alam Jony Ali Ahamad",            certificateId: "BFS FS 5005565", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Dang Zharena Saquin Batbatan",             certificateId: "BFS FS 5005566", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "John Rambo Montanez",                      certificateId: "BFS FS 5005546", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Karen Joy Lamera Gahol",                   certificateId: "BFS FS 5005456", issueDate: "2026-07-06", expiryDate: "2028-07-02" },
  { staffName: "Michelle Bathan Timbang",                  certificateId: "BFS FS 5005607", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Reinerio Frondozo",                        certificateId: "BFS FS 5005564", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Romy Jr Cayabyab",                         certificateId: "BFS FS 5005603", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Vince Kian Torres Dumlao",                 certificateId: "BFS FS 5005555", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "John Vie Echanes",                         certificateId: "BFS FS 5005457", issueDate: "2026-07-06", expiryDate: "2028-07-02" },
  { staffName: "Luis Bestuyong",                           certificateId: "BFS FS 5005569", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Md Abu Rayhanul Haque GM Aksedur Rahman",  certificateId: "BFS FS 5005609", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Mojjam Hossain Sagor Sultan Ahamed",       certificateId: "BFS FS 5005608", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Russel Joy Dela Cruz Alberto",             certificateId: "BFS FS 5005567", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
  { staffName: "Kezia Rabboni Pendon Ditchon",             certificateId: "BFS FS 5005606", issueDate: "2026-07-03", expiryDate: "2028-07-02" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const cleanCertId = (id) => String(id || "").trim().replace(/\s+/g, " ");
const normCertId  = (id) => cleanCertId(id).toUpperCase();
const normName    = (n) =>
  String(n || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  await setPersistence(auth, inMemoryPersistence);
  console.log(`Signing in as ${ADMIN_EMAIL}...`);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("Authenticated.\n");

  // Existing certificates → dedupe set keyed by normalized Certificate ID.
  const existingSnap = await getDocs(collection(db, "foodSafetyCertifications"));
  const existingCertIds = new Set();
  existingSnap.forEach((d) => {
    const cid = normCertId(d.data().certificateId);
    if (cid) existingCertIds.add(cid);
  });
  console.log(`Found ${existingSnap.size} existing Food Safety records.`);

  // Employees → name lookup for linking.
  const usersSnap = await getDocs(collection(db, "users"));
  const employeesByName = new Map();
  usersSnap.forEach((d) => {
    const data = d.data();
    const key = normName(data.name);
    if (key && !employeesByName.has(key)) {
      employeesByName.set(key, { uid: d.id, name: data.name });
    }
  });
  console.log(`Loaded ${usersSnap.size} employee records for matching.\n`);

  const batch = writeBatch(db);
  const summary = {
    imported: [], duplicates: [], linked: [], notLinked: [], failed: [],
  };
  const seenThisRun = new Set();

  for (const r of records) {
    try {
      const cid = normCertId(r.certificateId);

      if (existingCertIds.has(cid) || seenThisRun.has(cid)) {
        summary.duplicates.push(r);
        continue;
      }
      seenThisRun.add(cid);

      const match  = employeesByName.get(normName(r.staffName));
      const linked = Boolean(match);

      const ref = doc(collection(db, "foodSafetyCertifications"));
      batch.set(ref, {
        // ── same fields the manual form writes ──
        name:          r.staffName,
        employeeId:    "",                        // no human employee-ID in source data
        certificateId: cleanCertId(r.certificateId),
        issueDate:     r.issueDate,
        expiryDate:    r.expiryDate,
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
        // ── linking metadata (ignored by the manual form / table) ──
        employeeUid:    match ? match.uid : "",
        employeeName:   match ? match.name : "",
        employeeLinked: linked,
        importSource:   "bulk-food-safety-2026-07",
      });

      summary.imported.push(r);
      (linked ? summary.linked : summary.notLinked).push({
        cert: r.certificateId,
        staffName: r.staffName,
        employee: match ? match.name : null,
      });
    } catch (err) {
      summary.failed.push({ record: r, error: err.message });
    }
  }

  if (summary.imported.length > 0) {
    console.log(`Committing ${summary.imported.length} new record(s)...`);
    await batch.commit();
    console.log("Batch committed.\n");
  } else {
    console.log("Nothing new to import.\n");
  }

  // ─── SUMMARY ──────────────────────────────────────────────────────────────
  console.log("══════════════ IMPORT SUMMARY ══════════════");
  console.log(`Total records provided:        ${records.length}`);
  console.log(`Successfully imported:         ${summary.imported.length}`);
  console.log(`Skipped as duplicates:         ${summary.duplicates.length}`);
  console.log(`Employees linked successfully: ${summary.linked.length}`);
  console.log(`Employees not linked:          ${summary.notLinked.length}`);
  console.log(`Failed records:                ${summary.failed.length}`);
  console.log("═════════════════════════════════════════════\n");

  if (summary.duplicates.length) {
    console.log("— Skipped duplicates (Certificate ID already exists) —");
    summary.duplicates.forEach((r) => console.log(`   • ${r.certificateId}  (${r.staffName})`));
    console.log("");
  }
  if (summary.linked.length) {
    console.log("— Linked to employee —");
    summary.linked.forEach((r) => console.log(`   • ${r.staffName}  →  ${r.employee}`));
    console.log("");
  }
  if (summary.notLinked.length) {
    console.log("— Employee NOT linked (review later) —");
    summary.notLinked.forEach((r) => console.log(`   • ${r.staffName}  (${r.cert})`));
    console.log("");
  }
  if (summary.failed.length) {
    console.log("— Failed —");
    summary.failed.forEach((f) => console.log(`   • ${f.record.certificateId}: ${f.error}`));
    console.log("");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
