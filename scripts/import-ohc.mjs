// OHC Certifications Bulk Importer
// Usage: node scripts/import-ohc.mjs
// 1. Fill in ADMIN_EMAIL and ADMIN_PASSWORD below
// 2. Run the script
// 3. Clear your credentials from this file when done

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, inMemoryPersistence, setPersistence } from "firebase/auth";
import { getFirestore, collection, writeBatch, doc, serverTimestamp } from "firebase/firestore";

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

// ─── DATA (60 records) ────────────────────────────────────────────────────────
// Columns: name, nationality, passportNo, jobTitle, cardNo, issueDate, expiryDate
const records = [
  { name: "John Vie Labarete Echanes",                          nationality: "Philippines", passportNo: "P7388328B",  jobTitle: "Sales Officer",                  cardNo: "20120242347954", issueDate: "2025-05-12", expiryDate: "2026-05-12" },
  { name: "Russel Joy Dela Cruz Alberto",                        nationality: "Philippines", passportNo: "P7896711C",  jobTitle: "Sales Officer",                  cardNo: "20120252662486", issueDate: "2025-05-12", expiryDate: "2026-05-12" },
  { name: "Muhammed Baris Kurooli Pullantavida Mayamood",        nationality: "India",       passportNo: "Y5984782",   jobTitle: "Sales Officer",                  cardNo: "20120252548257", issueDate: "2025-05-21", expiryDate: "2026-05-21" },
  { name: "Keshab Dhungana",                                     nationality: "Nepal",       passportNo: "PA2454929",  jobTitle: "Stall and Market Salesperson",    cardNo: "20120222374050", issueDate: "2025-05-29", expiryDate: "2026-05-29" },
  { name: "Vince Kian Torres Dumlao",                            nationality: "Philippines", passportNo: "P4007998C",  jobTitle: "Sales Officer",                  cardNo: "20120252761831", issueDate: "2025-05-29", expiryDate: "2026-05-29" },
  { name: "Wilfredo Malabayabas Carpio",                         nationality: "Philippines", passportNo: "P9473441A",  jobTitle: "Sales Officer",                  cardNo: "20120222350944", issueDate: "2025-06-03", expiryDate: "2026-06-03" },
  { name: "Jay Creus Aala",                                      nationality: "Philippines", passportNo: "P9825990A",  jobTitle: "Sales Officer",                  cardNo: "20120212067151", issueDate: "2025-06-09", expiryDate: "2026-06-09" },
  { name: "Pelagio Jr Solar Balnaja",                            nationality: "Philippines", passportNo: "P5412338B",  jobTitle: "Sales Officer",                  cardNo: "20120222251193", issueDate: "2025-06-10", expiryDate: "2026-06-10" },
  { name: "Arshadul Alam Jony Ali Ahamad",                       nationality: "Bangladesh",  passportNo: "EL0225675",  jobTitle: "Sales Officer",                  cardNo: "20120222256243", issueDate: "2025-07-01", expiryDate: "2026-07-01" },
  { name: "Ronnel Catapang Enriquez",                            nationality: "Philippines", passportNo: "P9247419B",  jobTitle: "Butcher",                        cardNo: "20120242649513", issueDate: "2025-07-01", expiryDate: "2026-07-01" },
  { name: "Arbaaz Khan Yaseen Khan",                             nationality: "India",       passportNo: "U9418252",   jobTitle: "Sales Officer",                  cardNo: "20220252116553", issueDate: "2025-07-14", expiryDate: "2026-07-14" },
  { name: "Tasleem Safhik Ahamad",                               nationality: "India",       passportNo: "C8891166",   jobTitle: "Sales Officer",                  cardNo: "20220252299032", issueDate: "2025-08-08", expiryDate: "2026-08-08" },
  { name: "Aljon Guiron Feguracion",                             nationality: "Philippines", passportNo: "P8876317B",  jobTitle: "Sales Officer",                  cardNo: "20120232922450", issueDate: "2025-08-13", expiryDate: "2026-08-13" },
  { name: "Jayzenne Gamponia Gaston",                            nationality: "Philippines", passportNo: "P9768976B",  jobTitle: "Sales Officer",                  cardNo: "20120232743085", issueDate: "2025-08-18", expiryDate: "2026-08-18" },
  { name: "Kim Vladie Dinglasan Espayos",                        nationality: "Philippines", passportNo: "P9326778A",  jobTitle: "Sales",                          cardNo: "20120162330365", issueDate: "2025-08-27", expiryDate: "2026-08-27" },
  { name: "Fasil Thayyil Sidhik Sidhik",                         nationality: "India",       passportNo: "V6877417",   jobTitle: "Sales Officer",                  cardNo: "20220252537562", issueDate: "2025-09-01", expiryDate: "2026-09-01" },
  { name: "Hussainar Kanakoor Abdulla Kanakoor",                  nationality: "India",       passportNo: "P0029508",   jobTitle: "Sales Officer",                  cardNo: "20220252520719", issueDate: "2025-09-01", expiryDate: "2026-09-01" },
  { name: "Marcelo Pestano Parreno",                             nationality: "Philippines", passportNo: "P9897488A",  jobTitle: "Follow Up Clerk",                cardNo: "20120092200734", issueDate: "2025-09-01", expiryDate: "2026-09-01" },
  { name: "Chachie Nebab Vicedo",                                nationality: "Philippines", passportNo: "P0187663C",  jobTitle: "Sales",                          cardNo: "20120172770232", issueDate: "2025-09-09", expiryDate: "2026-09-09" },
  { name: "Mark Anthony De Guzman Padilla",                      nationality: "Philippines", passportNo: "P4388074B",  jobTitle: "Sales Officer",                  cardNo: "20120232986936", issueDate: "2025-09-11", expiryDate: "2026-09-11" },
  { name: "Jessa Camille Cordero Baltazar",                      nationality: "Philippines", passportNo: "P9403811C",  jobTitle: "Sales Officer",                  cardNo: "20220252463468", issueDate: "2025-09-24", expiryDate: "2026-09-24" },
  { name: "Jean Zamora Millena",                                  nationality: "Philippines", passportNo: "P9514098B",  jobTitle: "Sales Officer",                  cardNo: "20220252641289", issueDate: "2025-10-07", expiryDate: "2026-10-07" },
  { name: "Manilyn Del Valle Antonio",                           nationality: "Philippines", passportNo: "P9982214A",  jobTitle: "Accounting Clerk / General",     cardNo: "20120132401201", issueDate: "2025-10-08", expiryDate: "2026-10-08" },
  { name: "April Rose Monton Dimaano",                           nationality: "Philippines", passportNo: "P8567502B",  jobTitle: "Administrative Officer",         cardNo: "20220252896191", issueDate: "2025-10-29", expiryDate: "2026-10-29" },
  { name: "Deanna Evita Alabro Garcia",                          nationality: "Philippines", passportNo: "P3248952B",  jobTitle: "Sales Officer",                  cardNo: "20220252822879", issueDate: "2025-10-29", expiryDate: "2026-10-29" },
  { name: "Luis Jr Pecasio Bestuyong",                           nationality: "Philippines", passportNo: "P1425651B",  jobTitle: "Sales Officer",                  cardNo: "20220242564653", issueDate: "2025-11-21", expiryDate: "2026-11-21" },
  { name: "Edmund Gillaco Mancay",                               nationality: "Philippines", passportNo: "P3527025C",  jobTitle: "Butcher",                        cardNo: "20320252156225", issueDate: "2025-12-25", expiryDate: "2026-12-25" },
  { name: "Carla Marian Irizari Napiza",                         nationality: "Philippines", passportNo: "P0542738D",  jobTitle: "Sales Officer",                  cardNo: "20320252289666", issueDate: "2025-12-31", expiryDate: "2026-12-31" },
  { name: "Reinerio Gallaza Frondozo",                           nationality: "Philippines", passportNo: "P7991905A",  jobTitle: "Butcher",                        cardNo: "20320252218140", issueDate: "2026-01-05", expiryDate: "2027-01-05" },
  { name: "Dang Zharena Saquin Batbatan",                        nationality: "Philippines", passportNo: "P9700605C",  jobTitle: "Sales Officer",                  cardNo: "20320252289445", issueDate: "2026-01-09", expiryDate: "2027-01-09" },
  { name: "Belly Jay Sad Sad Malabuyoc",                         nationality: "Philippines", passportNo: "P6061600B",  jobTitle: "Sales",                          cardNo: "20120152729293", issueDate: "2026-01-12", expiryDate: "2027-01-12" },
  { name: "Renz Bryan Cabangbang De Ocampo",                     nationality: "Philippines", passportNo: "P2825311C",  jobTitle: "Sales Officer",                  cardNo: "20320252283760", issueDate: "2026-01-22", expiryDate: "2027-01-22" },
  { name: "Gregorio Nebrida Elutin",                             nationality: "Philippines", passportNo: "P5810779B",  jobTitle: "Sales Officer",                  cardNo: "20120242391966", issueDate: "2026-01-30", expiryDate: "2027-01-30" },
  { name: "Ronald Dinglasan Dinglasan",                          nationality: "Philippines", passportNo: "P7176564A",  jobTitle: "Sales Officer",                  cardNo: "20120212382721", issueDate: "2026-02-02", expiryDate: "2027-02-02" },
  { name: "Humaun Hazi Malek Kabir",                             nationality: "Bangladesh",  passportNo: "EK0185662",  jobTitle: "Sales Officer",                  cardNo: "20120202377753", issueDate: "2026-02-06", expiryDate: "2027-02-06" },
  { name: "Imthiyaz Ahammad Aboobakar Sahib",                    nationality: "India",       passportNo: "5724834",    jobTitle: "Sales",                          cardNo: "20120132562864", issueDate: "2026-02-16", expiryDate: "2027-02-16" },
  { name: "Faizul Muba Mohamed Mubarak",                         nationality: "Sri Lanka",   passportNo: "N7751717",   jobTitle: "Filing Clerk",                   cardNo: "20120212663032", issueDate: "2026-02-18", expiryDate: "2027-02-18" },
  { name: "Bhagwanbhai Dolatram Sindhi Dolatram Vasudevbhai Sindhi", nationality: "India",  passportNo: "W5337947",   jobTitle: "Archives Clerk",                 cardNo: "20120152202833", issueDate: "2026-02-23", expiryDate: "2027-02-23" },
  { name: "Mark Robert Dela Cruz Tupas",                         nationality: "Philippines", passportNo: "P0983768B",  jobTitle: "Filing Clerk",                   cardNo: "20120192891396", issueDate: "2026-02-23", expiryDate: "2027-02-23" },
  { name: "Angelica Santos Mendiola",                            nationality: "Philippines", passportNo: "P3173754B",  jobTitle: "Sales Officer",                  cardNo: "20120202396304", issueDate: "2026-03-02", expiryDate: "2027-03-02" },
  { name: "Garilyn Gertrude Giwan Tolentino",                    nationality: "Philippines", passportNo: "P2866172B",  jobTitle: "Sales Officer",                  cardNo: "20120092264705", issueDate: "2026-03-02", expiryDate: "2027-03-02" },
  { name: "Jezreel Pontojan Hetalla",                            nationality: "Philippines", passportNo: "P8681241B",  jobTitle: "Sales Officer",                  cardNo: "20220222589011", issueDate: "2026-03-10", expiryDate: "2027-03-10" },
  { name: "Romy Jr Delin Cayabyab",                              nationality: "Philippines", passportNo: "P1479273B",  jobTitle: "Butcher",                        cardNo: "20120242078275", issueDate: "2026-03-13", expiryDate: "2027-03-13" },
  { name: "Arsie Vi Iliong Gardiana",                            nationality: "Philippines", passportNo: "P0348391B",  jobTitle: "Sales Officer",                  cardNo: "20120242180411", issueDate: "2026-03-16", expiryDate: "2027-03-16" },
  { name: "Gilbert Perlora Panganiban",                          nationality: "Philippines", passportNo: "P1059808B",  jobTitle: "Follow Up Clerk",                cardNo: "20120092294387", issueDate: "2026-03-26", expiryDate: "2027-03-26" },
  { name: "Ronora Galura Aguas",                                  nationality: "Philippines", passportNo: "P2956737B",  jobTitle: "Sales Officer",                  cardNo: "20120212032989", issueDate: "2026-03-26", expiryDate: "2027-03-26" },
  { name: "Babeker Ibrahim Mohammd Ahmed",                       nationality: "Sudan",       passportNo: "P07999821",  jobTitle: "Supermarket Supervisor",         cardNo: "20120092107258", issueDate: "2026-03-27", expiryDate: "2027-03-27" },
  { name: "Hom Bahadur Adhikari",                                nationality: "Nepal",       passportNo: "PA1730339",  jobTitle: "Sales Supervisor",               cardNo: "20120092294388", issueDate: "2026-04-06", expiryDate: "2027-04-06" },
  { name: "Emiric Pangilinan Bautista",                          nationality: "Philippines", passportNo: "P6458574B",  jobTitle: "Archives Clerk",                 cardNo: "20120092089415", issueDate: "2026-04-07", expiryDate: "2027-04-07" },
  { name: "Michelle Bathan Timbang",                             nationality: "Philippines", passportNo: "P0165650B",  jobTitle: "Sales Officer",                  cardNo: "20220222548191", issueDate: "2026-04-13", expiryDate: "2027-04-13" },
  { name: "Marlon Calma Reyes",                                  nationality: "Philippines", passportNo: "P0242903B",  jobTitle: "Butcher",                        cardNo: "20120242078276", issueDate: "2026-04-15", expiryDate: "2027-04-15" },
  { name: "Dinesh Kumar Lalbabu Prasad",                         nationality: "India",       passportNo: "I0552314",   jobTitle: "Sales Officer",                  cardNo: "20120242363502", issueDate: "2026-04-23", expiryDate: "2027-04-23" },
  { name: "Mohammad Shamshad Abdul Hakim",                       nationality: "India",       passportNo: "T2067470",   jobTitle: "Sales Officer",                  cardNo: "20120242363263", issueDate: "2026-04-23", expiryDate: "2027-04-23" },
  { name: "Shekhar Nath Narayan Nath",                           nationality: "India",       passportNo: "X9285739",   jobTitle: "Sales Officer",                  cardNo: "20120252510863", issueDate: "2026-04-23", expiryDate: "2027-04-23" },
  { name: "Kyla Cabanit Ayala",                                  nationality: "Philippines", passportNo: "P4165659C",  jobTitle: "Sales Officer",                  cardNo: "20120262510685", issueDate: "2026-04-27", expiryDate: "2027-04-27" },
  { name: "Md Aslam Ajij Md",                                    nationality: "India",       passportNo: "C9570891",   jobTitle: "Sales Officer",                  cardNo: "20120242347493", issueDate: "2026-04-27", expiryDate: "2027-04-27" },
  { name: "Dave John Amo Burgos",                                nationality: "Philippines", passportNo: "P6810371B",  jobTitle: "Sales Officer",                  cardNo: "20120222077844", issueDate: "2026-05-01", expiryDate: "2027-05-01" },
  { name: "John Rambo Alibadbad Montanez",                       nationality: "Philippines", passportNo: "P1651153C",  jobTitle: "Sales Officer",                  cardNo: "20120252294255", issueDate: "2026-05-01", expiryDate: "2027-05-01" },
  { name: "Rajendra Thapa Chhetri",                              nationality: "Nepal",       passportNo: "PA0327101",  jobTitle: "Sales Officer",                  cardNo: "20120232300521", issueDate: "2026-05-11", expiryDate: "2027-05-11" },
  { name: "Yogendra Prasad Paudel Netra Prasad Paudel",          nationality: "Nepal",       passportNo: "12411369",   jobTitle: "Sales Officer",                  cardNo: "20120242304881", issueDate: "2026-05-11", expiryDate: "2027-05-11" },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  if (ADMIN_EMAIL === "YOUR_EMAIL_HERE" || ADMIN_PASSWORD === "YOUR_PASSWORD_HERE") {
    console.error("ERROR: Please set ADMIN_EMAIL and ADMIN_PASSWORD at the top of this file.");
    process.exit(1);
  }

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  await setPersistence(auth, inMemoryPersistence);

  console.log(`Signing in as ${ADMIN_EMAIL}...`);
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("Authenticated.");

  console.log(`Preparing ${records.length} records...`);
  const batch = writeBatch(db);

  for (const record of records) {
    const ref = doc(collection(db, "ohcCertifications"));
    batch.set(ref, {
      name:                  record.name,
      expiryDate:            record.expiryDate,
      nationality:           record.nationality,
      passportNo:            record.passportNo,
      jobTitle:              record.jobTitle,
      cardNo:                record.cardNo,
      issueDate:             record.issueDate,
      employeePhotoPath:     "",
      employeePhotoLink:     "",
      certificatePhotoPath:  "",
      certificatePhotoLink:  "",
      createdAt:             serverTimestamp(),
      updatedAt:             serverTimestamp(),
    });
  }

  console.log("Committing batch...");
  await batch.commit();
  console.log(`Done! ${records.length} OHC certifications imported successfully.`);
  process.exit(0);
}

main().catch(err => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
