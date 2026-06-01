// OHC Employee Photo Updater
// Fetches all OHC records from Firestore, matches them to birthday photos,
// uploads to Firebase Storage, and updates employeePhotoPath on each record.
// Usage: node scripts/update-ohc-photos.mjs

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, inMemoryPersistence, setPersistence } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CREDENTIALS ─────────────────────────────────────────────────────────────
const ADMIN_EMAIL    = "Power@PS.com";
const ADMIN_PASSWORD = "112233";

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAvGYmS-itQi0KpYSxMRWHHKokwEPrU1mM",
  authDomain: "company-employee-system-hamad.firebaseapp.com",
  projectId: "company-employee-system-hamad",
  storageBucket: "company-employee-system-hamad.firebasestorage.app",
  messagingSenderId: "72654624855",
  appId: "1:72654624885:web:f5bd0c6dbd1f5eea92c03c",
};

// ─── NAME → PHOTO MAPPING (OHC exact name → birthday photo filename) ─────────
const nameToPhoto = {
  "John Vie Labarete Echanes":                               "JOHN_VIE_ECHANES.png",
  "Russel Joy Dela Cruz Alberto":                            "RUSSEL_JOY_ALBERTO.png",
  "Muhammed Baris Kurooli Pullantavida Mayamood":            "MUHAMMED_BARIS_KUROOLI.png",
  "Keshab Dhungana":                                         "KESHAB_DHUNGANA.png",
  "Vince Kian Torres Dumlao":                                "VINCE_KIAN_DUMLAO.png",
  "Wilfredo Malabayabas Carpio":                             "WILFREDO_CARPIO.png",
  "Jay Creus Aala":                                          "JAY_AALA.png",
  "Pelagio Jr Solar Balnaja":                                "PELAGIO_JR_BALNAJA.png",
  "Arshadul Alam Jony Ali Ahamad":                           "ARSHADUL_ALAM_JONY.png",
  "Ronnel Catapang Enriquez":                                "RONNEL_ENRIQUEZ.png",
  "Arbaaz Khan Yaseen Khan":                                 "ARBAAZ_KHAN.png",
  "Tasleem Safhik Ahamad":                                   "TASLEEM_AHAMAD.png",
  "Aljon Guiron Feguracion":                                 "ALJON_FEGURACION.png",
  "Jayzenne Gamponia Gaston":                                "JAYZENNE_GASTON.png",
  "Kim Vladie Dinglasan Espayos":                            "KIM_VLADIE_ESPAYOS.png",
  "Fasil Thayyil Sidhik Sidhik":                             "FASIL_THAYYIL_SIDHIK.png",
  "Hussainar Kanakoor Abdulla Kanakoor":                     "HUSSAINAR_KANAKOOR.png",
  "Marcelo Pestano Parreno":                                 "MARCELO_PARRENO.png",
  "Chachie Nebab Vicedo":                                    "CHACHIE_VICEDO.png",
  "Mark Anthony De Guzman Padilla":                          "MARK_ANTHONY_PADILLA.png",
  "Jessa Camille Cordero Baltazar":                          "JESSA_CAMILLE_BALTAZAR.png",
  "Jean Zamora Millena":                                     "JEAN_MILLENA.png",
  "Manilyn Del Valle Antonio":                               "MANILYN_ANTONIO.png",
  "April Rose Monton Dimaano":                               "APRIL_ROSE_DIMAANO.png",
  "Deanna Evita Alabro Garcia":                              "DEANNA_EVITA_GARCIA.png",
  "Luis Jr Pecasio Bestuyong":                               "LUIS_JR_BESTUYONG.png",
  "Edmund Gillaco Mancay":                                   "EDMUND_MANCAY.png",
  "Carla Marian Irizari Napiza":                             "CARLA_MARIAN_NAPIZA.png",
  "Reinerio Gallaza Frondozo":                               "REINERIO_FRONDOZO.png",
  "Dang Zharena Saquin Batbatan":                            "DANG_ZHARENA_BATBATAN.png",
  "Belly Jay Sad Sad Malabuyoc":                             "BELLY_JAY_MALABUYOC.png",
  "Renz Bryan Cabangbang De Ocampo":                         "RENZ_BRYAN_DE_OCAMPO.png",
  "Gregorio Nebrida Elutin":                                 "GREGORIO_ELUTIN.png",
  "Ronald Dinglasan Dinglasan":                              "RONALD_DINGLASAN.png",
  "Humaun Hazi Malek Kabir":                                 "HUMAUN_KABIR.png",
  "Imthiyaz Ahammad Aboobakar Sahib":                        "IMTHIYAZ_AHAMMAD.png",
  "Faizul Muba Mohamed Mubarak":                             "FAIZUL_MUBA.png",
  "Bhagwanbhai Dolatram Sindhi Dolatram Vasudevbhai Sindhi": "BHAGWANBHAI_DOLATRAM_SINDHI.png",
  "Mark Robert Dela Cruz Tupas":                             "MARK_ROBERT_TUPAS.png",
  "Angelica Santos Mendiola":                                "ANGELICA_MENDIOLA.png",
  "Garilyn Gertrude Giwan Tolentino":                        "GARILYN_TOLENTINO.png",
  "Jezreel Pontojan Hetalla":                                "JEZREEL_HETALLA.png",
  "Romy Jr Delin Cayabyab":                                  "ROMY_JR_CAYABYAB.png",
  "Arsie Vi Iliong Gardiana":                                "ARSIE_VI_GARDIANA.png",
  "Gilbert Perlora Panganiban":                              "GILBERT_PANGANIBAN.png",
  "Ronora Galura Aguas":                                     "RONORA_AGUAS.png",
  "Babeker Ibrahim Mohammd Ahmed":                           "BABEKER_IBRAHIM_MOHAMMD_AHMED.png",
  "Hom Bahadur Adhikari":                                    "HOM_ADHIKARI.png",
  "Emiric Pangilinan Bautista":                              "EMIRIC_BAUTISTA.png",
  "Michelle Bathan Timbang":                                 "MICHELLE_TIMBANG.png",
  "Marlon Calma Reyes":                                      "MARLON_REYES.png",
  "Dinesh Kumar Lalbabu Prasad":                             "DINESH_KUMAR.png",
  "Mohammad Shamshad Abdul Hakim":                           "MOHAMMAD_SHAMSHAD.png",
  "Shekhar Nath Narayan Nath":                               "SHEKHAR_NATH.png",
  "Kyla Cabanit Ayala":                                      "KYLA_AYALA.png",
  "Md Aslam Ajij Md":                                        "MD_ASLAM.png",
  "Dave John Amo Burgos":                                    "DAVE_JOHN_BURGOS.png",
  "John Rambo Alibadbad Montanez":                           "JOHN_RAMBO_MONTANEZ.png",
  "Rajendra Thapa Chhetri":                                  "RAJENDRA_THAPA_CHHETRI.png",
  "Yogendra Prasad Paudel Netra Prasad Paudel":              "YOGENDRA_PRASAD_PAUDEL.png",
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const app     = initializeApp(firebaseConfig);
  const auth    = getAuth(app);
  const db      = getFirestore(app);
  const storage = getStorage(app);

  await setPersistence(auth, inMemoryPersistence);
  console.log(`Signing in as ${ADMIN_EMAIL}...`);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("Authenticated.\n");

  const snapshot = await getDocs(collection(db, "ohcCertifications"));
  console.log(`Found ${snapshot.size} OHC records in Firestore.\n`);

  const photosDir = join(__dirname, "birthday-photos");
  let updated = 0, skipped = 0, noMatch = 0, failed = 0;

  for (const docSnap of snapshot.docs) {
    const data     = docSnap.data();
    const name     = data.name ?? "";
    const photoFile = nameToPhoto[name];

    // No mapping found
    if (!photoFile) {
      console.log(`  -- NO MATCH: "${name}"`);
      noMatch++;
      continue;
    }

    // Already has a photo — skip
    if (data.employeePhotoPath) {
      console.log(`  -- SKIP (already has photo): ${name}`);
      skipped++;
      continue;
    }

    const fullPhotoPath = join(photosDir, photoFile);
    if (!existsSync(fullPhotoPath)) {
      console.log(`  ✗ FILE MISSING: ${photoFile}`);
      failed++;
      continue;
    }

    try {
      process.stdout.write(`  Uploading ${name}... `);
      const buffer      = readFileSync(fullPhotoPath);
      const storagePath = `ohc-employee-photos/shared/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${photoFile}`;
      const storageRef  = ref(storage, storagePath);
      await uploadBytes(storageRef, buffer, { contentType: "image/png" });

      await updateDoc(doc(db, "ohcCertifications", docSnap.id), {
        employeePhotoPath: storagePath,
        employeePhotoLink: "",
        updatedAt: serverTimestamp(),
      });

      console.log("✓");
      updated++;
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`);
      failed++;
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n──────────────────────────────────────`);
  console.log(`✓ Updated : ${updated}`);
  console.log(`-- Skipped : ${skipped} (already had photo)`);
  console.log(`-- No match: ${noMatch} (add manually)`);
  console.log(`✗ Failed  : ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
