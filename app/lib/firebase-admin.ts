import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null = null;
let cachedDb: Firestore | null = null;

export class AdminInitError extends Error {
  constructor(public readonly kind: "env_missing" | "env_invalid", message: string) {
    super(message);
    this.name = "AdminInitError";
  }
}

function readEnv(): { raw: string; source: string } {
  const candidates: [string, string | undefined][] = [
    ["FIREBASE_SERVICE_ACCOUNT_KEY_BASE64", process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64],
    ["FIREBASE_SERVICE_ACCOUNT_KEY", process.env.FIREBASE_SERVICE_ACCOUNT_KEY],
    ["FIREBASE_SERVICE_ACCOUNT", process.env.FIREBASE_SERVICE_ACCOUNT],
  ];

  for (const [name, value] of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return { raw: value, source: name };
    }
  }
  return { raw: "", source: "" };
}

function loadServiceAccount(): ServiceAccount {
  const { raw, source } = readEnv();
  if (!raw) {
    throw new AdminInitError(
      "env_missing",
      "FIREBASE_SERVICE_ACCOUNT_KEY (or _BASE64) is not set in this Vercel environment."
    );
  }

  // Strip surrounding quotes a user may have accidentally pasted
  let trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  // Decide JSON vs base64
  let jsonText: string;
  if (trimmed.startsWith("{")) {
    jsonText = trimmed;
  } else {
    // base64 path
    let decoded = "";
    try {
      decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
    } catch {
      throw new AdminInitError(
        "env_invalid",
        `${source} is neither valid JSON (must start with "{") nor valid base64.`
      );
    }
    if (!decoded.startsWith("{")) {
      throw new AdminInitError(
        "env_invalid",
        `${source} decoded from base64 but the result is not a JSON object. ` +
          `Make sure you base64-encoded the entire service-account JSON file.`
      );
    }
    jsonText = decoded;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    throw new AdminInitError(
      "env_invalid",
      `${source} did not parse as JSON: ${m}. Check for stray quotes, truncated content, or hidden characters.`
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AdminInitError("env_invalid", `${source} parsed to a non-object value.`);
  }

  const obj = parsed as Record<string, unknown>;

  // Vercel sometimes stores newlines as the literal two-character sequence "\n".
  if (typeof obj.private_key === "string" && obj.private_key.includes("\\n")) {
    obj.private_key = obj.private_key.replace(/\\n/g, "\n");
  }

  const projectId = typeof obj.project_id === "string" ? obj.project_id.trim() : "";
  const clientEmail = typeof obj.client_email === "string" ? obj.client_email.trim() : "";
  const privateKey = typeof obj.private_key === "string" ? obj.private_key : "";

  const missing: string[] = [];
  if (!projectId) missing.push("project_id");
  if (!clientEmail) missing.push("client_email");
  if (!privateKey) missing.push("private_key");
  if (missing.length > 0) {
    throw new AdminInitError(
      "env_invalid",
      `${source} JSON is missing required field(s): ${missing.join(", ")}.`
    );
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new AdminInitError(
      "env_invalid",
      `${source} private_key is malformed (no BEGIN PRIVATE KEY header). ` +
        `If you pasted multi-line, prefer the base64 form instead.`
    );
  }

  return { projectId, clientEmail, privateKey };
}

export function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0]!;
    return cachedApp;
  }

  const sa = loadServiceAccount();
  try {
    cachedApp = initializeApp({ credential: cert(sa) });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    throw new AdminInitError(
      "env_invalid",
      `Firebase Admin initializeApp failed: ${m}. Most often this means the private_key is corrupted.`
    );
  }
  return cachedApp;
}

export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = getFirestore(getAdminApp());
  return cachedDb;
}

/**
 * Run-once diagnostic: returns `{ ok: true, projectId }` when Admin SDK loads
 * cleanly, otherwise returns the human-readable reason. Safe to expose to
 * authenticated admins for troubleshooting.
 */
export function diagnose(): { ok: true; projectId: string } | { ok: false; kind: string; message: string } {
  try {
    getAdminApp();
    const app = getAdminApp();
    return { ok: true, projectId: app.options.projectId || "(unknown)" };
  } catch (err) {
    if (err instanceof AdminInitError) {
      return { ok: false, kind: err.kind, message: err.message };
    }
    return { ok: false, kind: "unknown", message: err instanceof Error ? err.message : String(err) };
  }
}
