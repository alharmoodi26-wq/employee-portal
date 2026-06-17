import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";

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
    const aggregate = await db
      .collection("assessmentSubmissions")
      .where("assessmentId", "==", assessmentId)
      .where("participantNameNormalized", "==", nameNormalized)
      .where("branch", "==", branch)
      .count()
      .get();

    const used = aggregate.data().count;
    const remaining = Math.max(0, maxAttempts - used);

    return NextResponse.json({
      success: true,
      attemptsUsed: used,
      attemptsRemaining: remaining,
      canAttempt: used < maxAttempts,
      maxAttempts,
    });
  } catch (err) {
    console.error(`[pa-check:${reqId}] error:`, err);
    return NextResponse.json({ code: "server_error" }, { status: 500 });
  }
}
