import { NextRequest, NextResponse } from "next/server";
import { AdminInitError, getAdminDb } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, no-auth endpoint.
// Returns the attempt-count for (assessmentId + nameNormalized + branch).
// Does NOT expose any submission contents.

const ALLOWED_BRANCHES = new Set([
  "PS Muraqqabat",
  "PS Karama",
]);

function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ code: "bad_request" }, { status: 400 });
  }

  const assessmentId = typeof body.assessmentId === "string" ? body.assessmentId.trim() : "";
  const participantName =
    typeof body.participantName === "string" ? body.participantName.trim() : "";
  const branch = typeof body.branch === "string" ? body.branch.trim() : "";

  console.log(
    `[pa-check:${reqId}] aid="${assessmentId}" name="${participantName}" branch="${branch}"`
  );

  if (!assessmentId || !participantName || participantName.length < 2 || !branch) {
    return NextResponse.json({ code: "bad_request" }, { status: 400 });
  }
  if (!ALLOWED_BRANCHES.has(branch)) {
    return NextResponse.json({ code: "bad_branch" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const assessmentSnap = await db.collection("assessments").doc(assessmentId).get();
    if (!assessmentSnap.exists) {
      return NextResponse.json({ code: "not_found" }, { status: 404 });
    }
    const assessment = assessmentSnap.data() as Record<string, unknown>;
    if (assessment.isActive === false) {
      return NextResponse.json({ code: "inactive" }, { status: 423 });
    }
    const maxAttempts =
      typeof assessment.maxAttempts === "number" ? assessment.maxAttempts : 2;

    const nameNormalized = normalizeName(participantName);
    const baseQuery = db
      .collection("assessmentSubmissions")
      .where("assessmentId", "==", assessmentId)
      .where("participantNameNormalized", "==", nameNormalized)
      .where("branch", "==", branch);

    // total − soft-deleted: a deleted attempt frees up a slot.
    // We subtract instead of filtering with `deleted == false` because legacy
    // submissions don't have the `deleted` field at all.
    const [totalAgg, deletedAgg] = await Promise.all([
      baseQuery.count().get(),
      baseQuery.where("deleted", "==", true).count().get(),
    ]);

    const used = Math.max(0, totalAgg.data().count - deletedAgg.data().count);
    const remaining = Math.max(0, maxAttempts - used);

    return NextResponse.json({
      success: true,
      attemptsUsed: used,
      attemptsRemaining: remaining,
      canAttempt: used < maxAttempts,
      maxAttempts,
    });
  } catch (err) {
    if (err instanceof AdminInitError) {
      console.error(`[pa-check:${reqId}] admin init failed: ${err.kind} — ${err.message}`);
      return NextResponse.json(
        { code: "server_misconfigured", kind: err.kind, detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pa-check:${reqId}] error:`, msg);
    return NextResponse.json({ code: "server_error", detail: msg }, { status: 500 });
  }
}
