import { NextResponse } from "next/server";
import { diagnose, getAdminDb } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public diagnostic endpoint. No secrets are returned beyond the projectId.
 * Used to confirm the Firebase Admin SDK is initialized correctly in this
 * Vercel environment after setting FIREBASE_SERVICE_ACCOUNT_KEY.
 *
 *   curl https://<your-vercel-domain>/api/public-assessment/health
 *
 * Success → { ok: true, projectId: "...", canReachFirestore: true }
 * Failure → { ok: false, kind: "env_missing" | "env_invalid", message: "..." }
 */
export async function GET() {
  const d = diagnose();
  if (!d.ok) {
    return NextResponse.json(d, { status: 500 });
  }

  // Also verify we can actually talk to Firestore (caught a wrong projectId
  // or revoked key faster than the user discovers it on the public page).
  try {
    const db = getAdminDb();
    // Cheap probe — just count one doc at most. If the collection doesn't
    // exist yet, this still succeeds with count = 0.
    await db.collection("assessments").limit(1).count().get();
    return NextResponse.json({
      ok: true,
      projectId: d.projectId,
      canReachFirestore: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        kind: "firestore_error",
        projectId: d.projectId,
        message: msg,
      },
      { status: 500 }
    );
  }
}
