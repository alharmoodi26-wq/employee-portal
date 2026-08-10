// Staff Passport Monitoring — Bulk Importer (idempotent)
//
// Writes into the SAME Firestore collection used by the manual
// "Add Passport" form:  staffPassports
//
// Safe to run more than once:
//   • De-duplicates by Passport Number (existing docs are read first).
//   • Never overwrites an existing record.
//   • Status / days-remaining / sorting / employee-photo matching are all
//     computed live in the UI — this script only writes the raw fields.
//
// The photo-match report below replicates the UI matcher (exact normalized
// name first, then a single-confident-candidate fuzzy match) so the summary
// reflects which records will show a matched employee photo.
//
// Usage:
//   1. (optional) export PORTAL_ADMIN_EMAIL / PORTAL_ADMIN_PASSWORD
//   2. node scripts/import-passports.mjs

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

// ─── DATA (81 records) ────────────────────────────────────────────────────────
const records = [
  { staffName: "KANAKOOR, Hussainar", passportNumber: "P0029508", country: "India", issuanceDate: "2016-05-09", expiryDate: "2026-05-08" },
  { staffName: "MOHAMMADI, Seyedeh Maryam", passportNumber: "H96881043", country: "Iran", issuanceDate: "2021-08-09", expiryDate: "2026-08-09" },
  { staffName: "ALLAWI, Mohammad Ali Hassan", passportNumber: "Q579061", country: "Jordan", issuanceDate: "2021-10-27", expiryDate: "2026-10-26" },
  { staffName: "KABIR, Humaun", passportNumber: "EK0185662", country: "Bangladesh", issuanceDate: "2022-02-07", expiryDate: "2027-02-06" },
  { staffName: "KUNNATH RAMACHANDRAN, Sooraj", passportNumber: "P9133732", country: "India", issuanceDate: "2017-04-11", expiryDate: "2027-04-10" },
  { staffName: "NEZARI, Seyed Mohammad Reza", passportNumber: "N97129006", country: "Iran", issuanceDate: "2022-05-13", expiryDate: "2027-05-13" },
  { staffName: "JONY, Arshadul Alam", passportNumber: "EL0225675", country: "Bangladesh", issuanceDate: "2023-01-05", expiryDate: "2028-01-04" },
  { staffName: "DITCHON, Kezia Rabboni Pendon", passportNumber: "P5936360A", country: "Philippines", issuanceDate: "2018-02-07", expiryDate: "2028-02-06" },
  { staffName: "AMERIPOUR, Inas", passportNumber: "A61437967", country: "Iran", issuanceDate: "2023-02-07", expiryDate: "2028-02-07" },
  { staffName: "SETHURAM, Sudarsan", passportNumber: "R9755081", country: "India", issuanceDate: "2018-03-07", expiryDate: "2028-03-06" },
  { staffName: "DINGLASAN, Ronald", passportNumber: "P7176564A", country: "Philippines", issuanceDate: "2018-05-15", expiryDate: "2028-05-14" },
  { staffName: "MOHAMED MUBARAK, Faizul Muba", passportNumber: "N7751717", country: "Sri Lanka", issuanceDate: "2018-06-18", expiryDate: "2028-06-18" },
  { staffName: "VADAKKAN, Shamil", passportNumber: "S6725606", country: "India", issuanceDate: "2018-10-22", expiryDate: "2028-10-21" },
  { staffName: "ESPAYOS, Kim Vladie Dinglasan", passportNumber: "P9326778A", country: "Philippines", issuanceDate: "2018-10-27", expiryDate: "2028-10-26" },
  { staffName: "CARPIO, Wilfredo Malabayabas", passportNumber: "P9473441A", country: "Philippines", issuanceDate: "2018-11-09", expiryDate: "2028-11-08" },
  { staffName: "AALA, Jay Creus", passportNumber: "P9825990A", country: "Philippines", issuanceDate: "2018-12-05", expiryDate: "2028-12-04" },
  { staffName: "PARRENO, Marcelo Pestano", passportNumber: "P9897488A", country: "Philippines", issuanceDate: "2018-12-12", expiryDate: "2028-12-11" },
  { staffName: "ANTONIO, Manilyn Del Valle", passportNumber: "P9982214A", country: "Philippines", issuanceDate: "2018-12-19", expiryDate: "2028-12-18" },
  { staffName: "TIMBANG, Michelle Bathan", passportNumber: "P0165650B", country: "Philippines", issuanceDate: "2019-01-09", expiryDate: "2029-01-08" },
  { staffName: "REYES, Marlon Calma", passportNumber: "P0242903B", country: "Philippines", issuanceDate: "2019-01-15", expiryDate: "2029-01-14" },
  { staffName: "GARDIANA, Arsie Vi Iliong", passportNumber: "P0348391B", country: "Philippines", issuanceDate: "2019-01-22", expiryDate: "2029-01-21" },
  { staffName: "TUPAS, Mark Robert Dela Cruz", passportNumber: "P0983768B", country: "Philippines", issuanceDate: "2019-03-09", expiryDate: "2029-03-08" },
  { staffName: "PANGANIBAN, Gilbert Perlora", passportNumber: "P1059808B", country: "Philippines", issuanceDate: "2019-03-15", expiryDate: "2029-03-14" },
  { staffName: "BESTUYONG, Luis Jr. Pecasio", passportNumber: "P1425651B", country: "Philippines", issuanceDate: "2019-04-10", expiryDate: "2029-04-09" },
  { staffName: "SHAMSHAD, Mohammad", passportNumber: "T2067470", country: "India", issuanceDate: "2019-07-22", expiryDate: "2029-07-21" },
  { staffName: "TOLENTINO, Garilyn Gertrude Giwan", passportNumber: "P2866172B", country: "Philippines", issuanceDate: "2019-08-27", expiryDate: "2029-08-26" },
  { staffName: "AGUAS, Ronora Galura", passportNumber: "P2956737B", country: "Philippines", issuanceDate: "2019-09-04", expiryDate: "2029-09-03" },
  { staffName: "MENDIOLA, Angelica Santos", passportNumber: "P3173754B", country: "Philippines", issuanceDate: "2019-09-13", expiryDate: "2029-09-12" },
  { staffName: "GARCIA, Deanna Evita Alabro", passportNumber: "P3248952B", country: "Philippines", issuanceDate: "2019-09-17", expiryDate: "2029-09-16" },
  { staffName: "PADILLA, Mark Anthony De Guzman", passportNumber: "P4388074B", country: "Philippines", issuanceDate: "2020-01-15", expiryDate: "2030-01-14" },
  { staffName: "DEL MUNDO, Richie Dinglasan", passportNumber: "P4899707B", country: "Philippines", issuanceDate: "2020-02-21", expiryDate: "2030-02-20" },
  { staffName: "BALNAJA, Pelagio Jr. Solar", passportNumber: "P5412338B", country: "Philippines", issuanceDate: "2020-08-17", expiryDate: "2030-08-16" },
  { staffName: "ELUTIN, Gregorio Nebrida", passportNumber: "P5810779B", country: "Philippines", issuanceDate: "2020-11-20", expiryDate: "2030-11-19" },
  { staffName: "MIRZA, Qayam Hyder", passportNumber: "T4369499", country: "India", issuanceDate: "2020-12-10", expiryDate: "2030-12-09" },
  { staffName: "MALABUYOC, Belly Jay Sad-Sad", passportNumber: "P6061600B", country: "Philippines", issuanceDate: "2021-01-08", expiryDate: "2031-01-07" },
  { staffName: "MAYAI, Juno", passportNumber: "124595014", country: "United Kingdom", issuanceDate: "2021-02-19", expiryDate: "2031-02-19" },
  { staffName: "BAUTISTA, Emiric Pangilinan", passportNumber: "P6458574B", country: "Philippines", issuanceDate: "2021-03-09", expiryDate: "2031-03-08" },
  { staffName: "KHAN, Arbaaz", passportNumber: "U9418252", country: "India", issuanceDate: "2021-05-12", expiryDate: "2031-05-11" },
  { staffName: "BURGOS, Dave John Amo", passportNumber: "P6810371B", country: "Philippines", issuanceDate: "2021-05-14", expiryDate: "2031-05-13" },
  { staffName: "RIZK, Maged Maher Kyrillos Rubel", passportNumber: "A37873233", country: "Egypt", issuanceDate: "2024-06-04", expiryDate: "2031-06-03" },
  { staffName: "OLEIWI, Yasir Atta", passportNumber: "A21991241", country: "Iraq", issuanceDate: "2021-07-23", expiryDate: "2031-07-22" },
  { staffName: "ECHANES, John Vie Labarete", passportNumber: "P7388328B", country: "Philippines", issuanceDate: "2021-08-12", expiryDate: "2031-08-11" },
  { staffName: "PAUDEL, Yogendra Prasad", passportNumber: "12411369", country: "Nepal", issuanceDate: "2021-09-27", expiryDate: "2031-09-26" },
  { staffName: "ANA PATTATH, Muhammed Shan", passportNumber: "V4591582", country: "India", issuanceDate: "2021-12-01", expiryDate: "2031-11-30" },
  { staffName: "DIMAANO, April Rose Monton", passportNumber: "P8567502B", country: "Philippines", issuanceDate: "2021-12-23", expiryDate: "2031-12-22" },
  { staffName: "HETALLA, Joanne Faye Lim", passportNumber: "P8680075B", country: "Philippines", issuanceDate: "2022-01-11", expiryDate: "2032-01-10" },
  { staffName: "HETALLA, Jezreel Pontojan", passportNumber: "P8681241B", country: "Philippines", issuanceDate: "2022-01-11", expiryDate: "2032-01-10" },
  { staffName: "FEGURACION, Aljon Guiron", passportNumber: "P8876317B", country: "Philippines", issuanceDate: "2022-02-08", expiryDate: "2032-02-07" },
  { staffName: "THAYYIL SIDHIK, Fasil", passportNumber: "V6877417", country: "India", issuanceDate: "2022-03-10", expiryDate: "2032-03-09" },
  { staffName: "ENRIQUEZ, Ronnel Catapang", passportNumber: "P9247419B", country: "Philippines", issuanceDate: "2022-03-20", expiryDate: "2032-03-19" },
  { staffName: "THAPA CHHETRI, Rajendra", passportNumber: "PA0327101", country: "Nepal", issuanceDate: "2022-05-06", expiryDate: "2032-05-05" },
  { staffName: "VICEDO, Chachie Nebab", passportNumber: "P0187663C", country: "Philippines", issuanceDate: "2022-05-22", expiryDate: "2032-05-21" },
  { staffName: "AMIRI, Sarah Alliah Mohd Saeed Del Rosario", passportNumber: "P0313373C", country: "Philippines", issuanceDate: "2022-05-31", expiryDate: "2032-05-30" },
  { staffName: "MARCO, Joanamel Frane", passportNumber: "P1579905C", country: "Philippines", issuanceDate: "2022-09-06", expiryDate: "2032-09-05" },
  { staffName: "MONTANEZ, John Rambo Albadbad", passportNumber: "P1651153C", country: "Philippines", issuanceDate: "2022-09-13", expiryDate: "2032-09-12" },
  { staffName: "SINDHI, Bhagwanbhai Dolatram", passportNumber: "W5337947", country: "India", issuanceDate: "2022-12-24", expiryDate: "2032-12-23" },
  { staffName: "DE OCAMPO, Renz Bryan Cabangbang", passportNumber: "P2825311C", country: "Philippines", issuanceDate: "2023-01-06", expiryDate: "2033-01-05" },
  { staffName: "SHARMA, Lakshmi Narayan", passportNumber: "W7534750", country: "India", issuanceDate: "2023-01-11", expiryDate: "2033-01-10" },
  { staffName: "MANCAY, Edmund Gillaco", passportNumber: "P3527025C", country: "Philippines", issuanceDate: "2023-03-10", expiryDate: "2033-03-09" },
  { staffName: "JALANDONI, Maricel Galiga", passportNumber: "P3908685C", country: "Philippines", issuanceDate: "2023-04-20", expiryDate: "2033-04-19" },
  { staffName: "DUMLAO, Vince Kian Torres", passportNumber: "P4007998C", country: "Philippines", issuanceDate: "2023-05-02", expiryDate: "2033-05-01" },
  { staffName: "ADHIKARI, Hom Bahadur", passportNumber: "PA1730339", country: "Nepal", issuanceDate: "2023-05-17", expiryDate: "2033-05-16" },
  { staffName: "AYALA, Kyla Cabanit", passportNumber: "P4165659C", country: "Philippines", issuanceDate: "2023-05-18", expiryDate: "2033-05-17" },
  { staffName: "NATH, Shekhar", passportNumber: "X9285739", country: "India", issuanceDate: "2023-06-01", expiryDate: "2033-05-31" },
  { staffName: "KUROOLI PULLANTAVIDA, Muhammed Baris", passportNumber: "Y5984782", country: "India", issuanceDate: "2023-07-11", expiryDate: "2033-07-10" },
  { staffName: "IMTHIYAZ AHAMMAD", passportNumber: "Y5724834", country: "India", issuanceDate: "2023-07-12", expiryDate: "2033-07-11" },
  { staffName: "SERVITILLO, Joana Marie Oreta", passportNumber: "P4998210C", country: "Philippines", issuanceDate: "2023-08-15", expiryDate: "2033-08-14" },
  { staffName: "PARAKKOTTIL, Riyas", passportNumber: "Y9865407", country: "India", issuanceDate: "2023-09-29", expiryDate: "2033-09-28" },
  { staffName: "BALLESTEROS, Alberto Jr. De Vera", passportNumber: "P6417553C", country: "Philippines", issuanceDate: "2024-02-03", expiryDate: "2034-02-02" },
  { staffName: "ACHARJEE, Kumar Raxy", passportNumber: "A14027908", country: "Bangladesh", issuanceDate: "2024-02-04", expiryDate: "2034-02-03" },
  { staffName: "DHUNGANA, Keshab", passportNumber: "PA2454929", country: "Nepal", issuanceDate: "2024-02-14", expiryDate: "2034-02-13" },
  { staffName: "VALDEZ, Reynold Jr. De La Rosa", passportNumber: "P6767983C", country: "Philippines", issuanceDate: "2024-03-25", expiryDate: "2034-03-24" },
  { staffName: "THEKKAN, Abdul Rafeekh", passportNumber: "Y1056209", country: "India", issuanceDate: "2024-04-11", expiryDate: "2034-04-10" },
  { staffName: "ODANGAL, Sakkeer Hussain", passportNumber: "C4069568", country: "India", issuanceDate: "2024-10-25", expiryDate: "2034-10-24" },
  { staffName: "THOPPIL ABRAHAM, John", passportNumber: "Z5439909", country: "India", issuanceDate: "2024-11-01", expiryDate: "2034-10-31" },
  { staffName: "BALTAZAR, Jessa Camille Cordero", passportNumber: "P9403811C", country: "Philippines", issuanceDate: "2025-04-08", expiryDate: "2035-04-07" },
  { staffName: "KUMAR, Dinesh", passportNumber: "I0552314", country: "India", issuanceDate: "2025-05-19", expiryDate: "2035-05-18" },
  { staffName: "BATBATAN, Dang Zharena Saquin", passportNumber: "P9700605C", country: "Philippines", issuanceDate: "2025-05-24", expiryDate: "2035-05-23" },
  { staffName: "MD ASLAM", passportNumber: "C9570891", country: "India", issuanceDate: "2025-09-30", expiryDate: "2035-09-29" },
  { staffName: "KODAKKAT, Fasil", passportNumber: "AK029019", country: "India", issuanceDate: "2025-12-19", expiryDate: "2035-12-18" },
  { staffName: "BABEKER, Ibrahim Mohammd Ahmed", passportNumber: "P14948496", country: "Sudan", issuanceDate: "2026-02-06", expiryDate: "2036-02-05" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const normPassport = (p) => String(p || "").trim().toUpperCase();
const cleanPassport = (p) => String(p || "").trim();

// Same normalization the UI uses for name matching.
const normName = (name) =>
  String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Build the same photo lookup the UI builds (OHC headshots, birthday photos,
// employee profile photos). A record is considered to "have a photo" if it has
// a stored link OR a storage path (the UI resolves the path to a URL).
function buildPhotoIndex(sources) {
  const byExact = new Map();
  const entries = [];
  const add = (name, photo) => {
    const url = String(photo || "").trim();
    if (!name || !url) return;
    const norm = normName(name);
    if (!norm) return;
    if (!byExact.has(norm)) byExact.set(norm, url);
    entries.push({ norm, tokens: norm.split(" ").filter(Boolean), photo: url });
  };
  for (const s of sources) add(s.name, s.photo);
  return { byExact, entries };
}

// Mirrors the UI getFSPhoto(): exact normalized match, else a single confident
// fuzzy match (≥2 overlapping tokens + subset either direction). Ambiguous or
// none → "".
function matchPhoto(index, name) {
  const norm = normName(name);
  if (!norm) return "";
  const exact = index.byExact.get(norm);
  if (exact) return exact;
  const ct = norm.split(" ").filter(Boolean);
  if (ct.length < 2) return "";
  const cs = new Set(ct);
  const candidates = [];
  for (const e of index.entries) {
    const candSet = new Set(e.tokens);
    let overlap = 0;
    for (const t of cs) if (candSet.has(t)) overlap += 1;
    const subset = ct.every((t) => candSet.has(t)) || e.tokens.every((t) => cs.has(t));
    if (overlap >= 2 && subset) candidates.push({ tokens: e.tokens, photo: e.photo });
  }
  if (candidates.length === 0) return "";
  // Same person if every candidate is a subset of the fullest name; else two
  // different people match → ambiguous → "".
  let fullest = candidates[0];
  for (const c of candidates) if (c.tokens.length > fullest.tokens.length) fullest = c;
  const fullestSet = new Set(fullest.tokens);
  const allSame = candidates.every((c) => c.tokens.every((t) => fullestSet.has(t)));
  return allSame ? fullest.photo : "";
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  await setPersistence(auth, inMemoryPersistence);
  console.log(`Signing in as ${ADMIN_EMAIL}...`);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("Authenticated.\n");

  // Existing passports → dedupe set keyed by normalized Passport Number.
  const existingSnap = await getDocs(collection(db, "staffPassports"));
  const existingPassportNums = new Set();
  existingSnap.forEach((d) => {
    const n = normPassport(d.data().passportNumber);
    if (n) existingPassportNums.add(n);
  });
  console.log(`Found ${existingSnap.size} existing passport records.`);

  // Build the employee-photo lookup from the same sources the UI uses.
  const photoSources = [];
  const [ohcSnap, bdaySnap, usersSnap] = await Promise.all([
    getDocs(collection(db, "ohcCertifications")),
    getDocs(collection(db, "birthdays")),
    getDocs(collection(db, "users")),
  ]);
  ohcSnap.forEach((d) => { const x = d.data(); photoSources.push({ name: x.name, photo: x.employeePhotoLink || x.employeePhotoPath }); });
  bdaySnap.forEach((d) => { const x = d.data(); photoSources.push({ name: x.name, photo: x.photoLink || x.photoPath }); });
  usersSnap.forEach((d) => { const x = d.data(); photoSources.push({ name: x.name, photo: x.profilePhotoUrl }); });
  const photoIndex = buildPhotoIndex(photoSources);
  console.log(`Loaded ${photoSources.length} employee/photo sources for matching.\n`);

  const batch = writeBatch(db);
  const summary = { imported: [], duplicates: [], matched: [], notMatched: [], failed: [] };
  const seenThisRun = new Set();

  for (const r of records) {
    try {
      const num = normPassport(r.passportNumber);
      if (existingPassportNums.has(num) || seenThisRun.has(num)) {
        summary.duplicates.push(r);
        continue;
      }
      seenThisRun.add(num);

      const photo = matchPhoto(photoIndex, r.staffName);

      const ref = doc(collection(db, "staffPassports"));
      batch.set(ref, {
        // ── exact fields the manual Add Passport form writes ──
        name: r.staffName,
        passportNumber: cleanPassport(r.passportNumber),
        country: r.country || "",
        issueDate: r.issuanceDate || "",
        expiryDate: r.expiryDate || "",
        photoPath: "",
        photoLink: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      summary.imported.push(r);
      (photo ? summary.matched : summary.notMatched).push(r.staffName);
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

  const finalTotal = existingSnap.size + summary.imported.length;

  // ─── SUMMARY ──────────────────────────────────────────────────────────────
  console.log("═════════════════ IMPORT SUMMARY ═════════════════");
  console.log(`Total records provided:            ${records.length}`);
  console.log(`Successfully imported:             ${summary.imported.length}`);
  console.log(`Skipped as duplicates:             ${summary.duplicates.length}`);
  console.log(`Employee photos matched:           ${summary.matched.length}`);
  console.log(`Employee photos NOT matched:       ${summary.notMatched.length}`);
  console.log(`Failed records:                    ${summary.failed.length}`);
  console.log(`Final total passports in Firestore: ${finalTotal}`);
  console.log("═══════════════════════════════════════════════════\n");

  if (summary.duplicates.length) {
    console.log("— Skipped duplicates (Passport Number already exists) —");
    summary.duplicates.forEach((r) => console.log(`   • ${r.passportNumber}  (${r.staffName})`));
    console.log("");
  }
  if (summary.notMatched.length) {
    console.log("— No confident employee-photo match (default avatar) —");
    summary.notMatched.forEach((n) => console.log(`   • ${n}`));
    console.log("");
  }
  if (summary.failed.length) {
    console.log("— Failed —");
    summary.failed.forEach((f) => console.log(`   • ${f.record.passportNumber}: ${f.error}`));
    console.log("");
  }

  // Duplicate-number integrity check across the whole collection.
  const afterSnap = await getDocs(collection(db, "staffPassports"));
  const counts = new Map();
  afterSnap.forEach((d) => {
    const n = normPassport(d.data().passportNumber);
    counts.set(n, (counts.get(n) || 0) + 1);
  });
  const dupNums = [...counts.entries()].filter(([, c]) => c > 1);
  console.log(dupNums.length === 0
    ? "✓ Integrity check: no duplicate Passport Numbers in Firestore."
    : `✗ Integrity check: duplicates found → ${dupNums.map(([n, c]) => `${n} (x${c})`).join(", ")}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
