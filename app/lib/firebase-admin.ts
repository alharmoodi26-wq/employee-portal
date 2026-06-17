import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null = null;
let cachedDb: Firestore | null = null;

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY env var is missing. " +
        "Paste the full service-account JSON (raw or base64) into the Vercel project env vars."
    );
  }

  // Accept either raw JSON or base64-encoded JSON
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : Buffer.from(trimmed, "base64").toString("utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON. Paste the full JSON downloaded from " +
        "Firebase Console → Project Settings → Service accounts → Generate new private key."
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY decoded to a non-object value.");
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.private_key === "string" && obj.private_key.includes("\\n")) {
    // Vercel sometimes stores newlines as the literal "\n" — restore them
    obj.private_key = obj.private_key.replace(/\\n/g, "\n");
  }

  return {
    projectId: typeof obj.project_id === "string" ? obj.project_id : undefined,
    clientEmail: typeof obj.client_email === "string" ? obj.client_email : undefined,
    privateKey: typeof obj.private_key === "string" ? obj.private_key : undefined,
  } as ServiceAccount;
}

export function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0]!;
    return cachedApp;
  }

  const sa = loadServiceAccount();
  cachedApp = initializeApp({
    credential: cert(sa),
  });
  return cachedApp;
}

export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = getFirestore(getAdminApp());
  return cachedDb;
}
