// Birthday Bulk Importer — with photo upload to Firebase Storage
// Usage: node scripts/import-birthdays.mjs
// Photos must be in: scripts/birthday-photos/

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, inMemoryPersistence, setPersistence } from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
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
  messagingSenderId: "72654624885",
  appId: "1:72654624885:web:f5bd0c6dbd1f5eea92c03c",
};

// ─── DATA: [name, birthday YYYY-MM-DD, photo filename] ───────────────────────
const records = [
  { name: "Aljon Feguracion",                    birthday: "1990-08-09", photo: "ALJON_FEGURACION.png" },
  { name: "Angelica Mendiola",                   birthday: "1998-09-05", photo: "ANGELICA_MENDIOLA.png" },
  { name: "April Rose Dimaano",                  birthday: "1995-04-30", photo: "APRIL_ROSE_DIMAANO.png" },
  { name: "Arbaaz Khan",                         birthday: "2003-02-05", photo: "ARBAAZ_KHAN.png" },
  { name: "Arshadul Alam Jony",                  birthday: "1996-07-15", photo: "ARSHADUL_ALAM_JONY.png" },
  { name: "Arsie Vi Gardiana",                   birthday: "1987-09-15", photo: "ARSIE_VI_GARDIANA.png" },
  { name: "Babeker Ibrahim Mohammd Ahmed",        birthday: "1982-12-03", photo: "BABEKER_IBRAHIM_MOHAMMD_AHMED.png" },
  { name: "Belly Jay Malabuyoc",                 birthday: "1989-12-09", photo: "BELLY_JAY_MALABUYOC.png" },
  { name: "Bhagwanbhai Dolatram Sindhi",          birthday: "1981-02-01", photo: "BHAGWANBHAI_DOLATRAM_SINDHI.png" },
  { name: "Carla Marian Napiza",                 birthday: "2006-01-11", photo: "CARLA_MARIAN_NAPIZA.png" },
  { name: "Chachie Vicedo",                      birthday: "1984-07-26", photo: "CHACHIE_VICEDO.png" },
  { name: "Dang Zharena Batbatan",               birthday: "2007-08-21", photo: "DANG_ZHARENA_BATBATAN.png" },
  { name: "Dave John Burgos",                    birthday: "1982-11-13", photo: "DAVE_JOHN_BURGOS.png" },
  { name: "Deanna Evita Garcia",                 birthday: "1996-07-13", photo: "DEANNA_EVITA_GARCIA.png" },
  { name: "Dinesh Kumar",                        birthday: "1986-06-18", photo: "DINESH_KUMAR.png" },
  { name: "Edmund Mancay",                       birthday: "1994-06-17", photo: "EDMUND_MANCAY.png" },
  { name: "Emiric Bautista",                     birthday: "1978-11-04", photo: "EMIRIC_BAUTISTA.png" },
  { name: "Faizul Muba",                         birthday: "1994-11-06", photo: "FAIZUL_MUBA.png" },
  { name: "Fasil Thayyil Sidhik",                birthday: "1999-05-10", photo: "FASIL_THAYYIL_SIDHIK.png" },
  { name: "Garilyn Tolentino",                   birthday: "1965-12-02", photo: "GARILYN_TOLENTINO.png" },
  { name: "Gilbert Panganiban",                  birthday: "1970-03-24", photo: "GILBERT_PANGANIBAN.png" },
  { name: "Gregorio Elutin",                     birthday: "1974-07-16", photo: "GREGORIO_ELUTIN.png" },
  { name: "Hom Adhikari",                        birthday: "1981-05-10", photo: "HOM_ADHIKARI.png" },
  { name: "Humaun Kabir",                        birthday: "1983-04-18", photo: "HUMAUN_KABIR.png" },
  { name: "Hussainar Kanakoor",                  birthday: "1991-10-10", photo: "HUSSAINAR_KANAKOOR.png" },
  { name: "Imthiyaz Ahammad",                    birthday: "1960-07-20", photo: "IMTHIYAZ_AHAMMAD.png" },
  { name: "Jay Aala",                            birthday: "1982-09-10", photo: "JAY_AALA.png" },
  { name: "Jayzenne Gaston",                     birthday: "1999-12-18", photo: "JAYZENNE_GASTON.png" },
  { name: "Jean Millena",                        birthday: "1994-10-12", photo: "JEAN_MILLENA.png" },
  { name: "Jessa Camille Baltazar",              birthday: "1996-05-14", photo: "JESSA_CAMILLE_BALTAZAR.png" },
  { name: "Jezreel Hetalla",                     birthday: "1984-06-11", photo: "JEZREEL_HETALLA.png" },
  { name: "Joana Marie Servitillo",              birthday: "1991-07-20", photo: "JOANA_MARIE_SERVITILLO.png" },
  { name: "John Rambo Montanez",                 birthday: "1991-07-17", photo: "JOHN_RAMBO_MONTANEZ.png" },
  { name: "John Vie Echanes",                    birthday: "2002-04-09", photo: "JOHN_VIE_ECHANES.png" },
  { name: "Keshab Dhungana",                     birthday: "1986-07-08", photo: "KESHAB_DHUNGANA.png" },
  { name: "Kim Vladie Espayos",                  birthday: "1992-06-26", photo: "KIM_VLADIE_ESPAYOS.png" },
  { name: "Kyla Ayala",                          birthday: "1999-08-28", photo: "KYLA_AYALA.png" },
  { name: "Luis Jr Bestuyong",                   birthday: "1989-12-08", photo: "LUIS_JR_BESTUYONG.png" },
  { name: "Manilyn Antonio",                     birthday: "1987-01-25", photo: "MANILYN_ANTONIO.png" },
  { name: "Marcelo Parreno",                     birthday: "1972-08-08", photo: "MARCELO_PARRENO.png" },
  { name: "Maricel Jalandoni",                   birthday: "1999-09-27", photo: "MARICEL_JALANDONI.png" },
  { name: "Mark Anthony Padilla",                birthday: "1986-01-12", photo: "MARK_ANTHONY_PADILLA.png" },
  { name: "Mark Robert Tupas",                   birthday: "1988-05-02", photo: "MARK_ROBERT_TUPAS.png" },
  { name: "Marlon Reyes",                        birthday: "1980-04-22", photo: "MARLON_REYES.png" },
  { name: "Md Aslam",                            birthday: "1994-11-01", photo: "MD_ASLAM.png" },
  { name: "Michelle Timbang",                    birthday: "1977-06-18", photo: "MICHELLE_TIMBANG.png" },
  { name: "Mirza Qayam Hyder",                   birthday: "1966-05-10", photo: "MIRZA_QAYAM_HYDER.png" },
  { name: "Mohammad Shamshad",                   birthday: "1998-02-11", photo: "MOHAMMAD_SHAMSHAD.png" },
  { name: "Muhammed Baris Kurooli",              birthday: "1995-11-28", photo: "MUHAMMED_BARIS_KUROOLI.png" },
  { name: "Pelagio Jr Balnaja",                  birthday: "1979-10-16", photo: "PELAGIO_JR_BALNAJA.png" },
  { name: "Rajendra Thapa Chhetri",              birthday: "1984-12-19", photo: "RAJENDRA_THAPA_CHHETRI.png" },
  { name: "Reinerio Frondozo",                   birthday: "1991-06-18", photo: "REINERIO_FRONDOZO.png" },
  { name: "Renz Bryan De Ocampo",                birthday: "1999-04-14", photo: "RENZ_BRYAN_DE_OCAMPO.png" },
  { name: "Richie Del Mundo",                    birthday: "1977-09-06", photo: "RICHIE_DEL_MUNDO.png" },
  { name: "Romy Jr Cayabyab",                    birthday: "1976-08-04", photo: "ROMY_JR_CAYABYAB.png" },
  { name: "Ronald Dinglasan",                    birthday: "1968-05-03", photo: "RONALD_DINGLASAN.png" },
  { name: "Ronnel Enriquez",                     birthday: "1993-08-11", photo: "RONNEL_ENRIQUEZ.png" },
  { name: "Ronora Aguas",                        birthday: "1994-10-30", photo: "RONORA_AGUAS.png" },
  { name: "Russel Joy Alberto",                  birthday: "1997-06-24", photo: "RUSSEL_JOY_ALBERTO.png" },
  { name: "Shekhar Nath",                        birthday: "1978-09-18", photo: "SHEKHAR_NATH.png" },
  { name: "Tasleem Ahamad",                      birthday: "1990-07-05", photo: "TASLEEM_AHAMAD.png" },
  { name: "Vince Kian Dumlao",                   birthday: "2002-01-12", photo: "VINCE_KIAN_DUMLAO.png" },
  { name: "Wilfredo Carpio",                     birthday: "1983-12-26", photo: "WILFREDO_CARPIO.png" },
  { name: "Yogendra Prasad Paudel",              birthday: "2000-04-23", photo: "YOGENDRA_PRASAD_PAUDEL.png" },
];

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

  const photosDir = join(__dirname, "birthday-photos");
  let success = 0;
  let failed  = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const photoFile = join(photosDir, record.photo);
    process.stdout.write(`[${String(i + 1).padStart(2, "0")}/${records.length}] ${record.name}... `);

    try {
      // Upload photo to Firebase Storage
      if (!existsSync(photoFile)) {
        throw new Error(`Photo not found: ${record.photo}`);
      }
      const photoBuffer = readFileSync(photoFile);
      const storagePath = `birthday-photos/shared/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${record.photo}`;
      const storageRef  = ref(storage, storagePath);
      await uploadBytes(storageRef, photoBuffer, { contentType: "image/png" });

      // Insert Firestore document
      await addDoc(collection(db, "birthdays"), {
        name:      record.name,
        birthday:  record.birthday,
        photoPath: storagePath,
        photoLink: "",
        createdAt: serverTimestamp(),
      });

      console.log("✓");
      success++;
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`);
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n──────────────────────────────────`);
  console.log(`Done! ✓ ${success} imported, ✗ ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("\nImport failed:", err.message);
  process.exit(1);
});
