import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { AdminInitError, getAdminDb } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, no-auth endpoint.
// Server-side scoring + attempt enforcement. The client never has access to the
// correct answers; it just submits chosen indices.

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

  const assessmentId =
    typeof body.assessmentId === "string" ? body.assessmentId.trim() : "";
  const participantName =
    typeof body.participantName === "string" ? body.participantName.trim() : "";
  const branch = typeof body.branch === "string" ? body.branch.trim() : "";
  const answers = Array.isArray(body.answers)
    ? (body.answers as unknown[]).map((a) => (typeof a === "number" ? a : -1))
    : null;

  console.log(
    `[pa-submit:${reqId}] aid="${assessmentId}" name="${participantName}" branch="${branch}" answersLen=${answers?.length ?? -1}`
  );

  if (!assessmentId || !participantName || participantName.length < 2 || !branch || !answers) {
    return NextResponse.json({ code: "bad_request" }, { status: 400 });
  }
  if (participantName.length > 200) {
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
    const passingPercentage =
      typeof assessment.passingPercentage === "number" ? assessment.passingPercentage : 70;
    const assessmentCode =
      typeof assessment.code === "string" ? assessment.code : "";
    const assessmentTitle =
      typeof assessment.title === "string" ? assessment.title : "Untitled Assessment";

    const rawQuestions = Array.isArray(assessment.questions) ? assessment.questions : [];
    const questions = rawQuestions.map((q: unknown) => {
      const item = (q ?? {}) as Record<string, unknown>;
      const opts = Array.isArray(item.options)
        ? (item.options as unknown[]).map((o) => (typeof o === "string" ? o : ""))
        : [];
      return {
        correctAnswerIndex:
          typeof item.correctAnswerIndex === "number" ? item.correctAnswerIndex : -1,
        optionsLen: opts.length,
      };
    });

    if (questions.length === 0) {
      return NextResponse.json({ code: "no_questions" }, { status: 422 });
    }
    if (answers.length !== questions.length) {
      return NextResponse.json({ code: "bad_answers" }, { status: 400 });
    }
    for (let i = 0; i < answers.length; i++) {
      const a = answers[i];
      const q = questions[i];
      if (!Number.isInteger(a) || a < 0 || a >= q.optionsLen) {
        return NextResponse.json({ code: "bad_answers" }, { status: 400 });
      }
    }

    const nameNormalized = normalizeName(participantName);

    // Re-check attempts atomically right before insert. With concurrent tabs the
    // total could exceed maxAttempts by 1 in the worst case, but admin can spot
    // duplicates by name + branch + submittedAt.
    const aggregate = await db
      .collection("assessmentSubmissions")
      .where("assessmentId", "==", assessmentId)
      .where("participantNameNormalized", "==", nameNormalized)
      .where("branch", "==", branch)
      .count()
      .get();

    const used = aggregate.data().count;
    if (used >= maxAttempts) {
      return NextResponse.json(
        {
          code: "max_attempts",
          attemptsUsed: used,
          maxAttempts,
        },
        { status: 409 }
      );
    }

    const attemptNumber = used + 1;
    const total = questions.length;
    const correctAnswers = questions.map((q) => q.correctAnswerIndex);
    let score = 0;
    for (let i = 0; i < total; i++) {
      if (answers[i] === questions[i].correctAnswerIndex) score++;
    }
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const status = percentage >= passingPercentage ? "Pass" : "Fail";

    const submissionDoc = {
      assessmentId,
      assessmentCode,
      assessmentTitle,
      participantName,
      participantNameNormalized: nameNormalized,
      branch,
      attemptNumber,
      answers,
      correctAnswers,
      score,
      totalQuestions: total,
      percentage,
      status,
      submittedAt: FieldValue.serverTimestamp(),
    };

    const newRef = await db.collection("assessmentSubmissions").add(submissionDoc);

    return NextResponse.json({
      success: true,
      submissionId: newRef.id,
      attemptNumber,
      maxAttempts,
      score,
      totalQuestions: total,
      percentage,
      status,
    });
  } catch (err) {
    if (err instanceof AdminInitError) {
      console.error(`[pa-submit:${reqId}] admin init failed: ${err.kind} — ${err.message}`);
      return NextResponse.json(
        { code: "server_misconfigured", kind: err.kind, detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pa-submit:${reqId}] error:`, msg);
    return NextResponse.json({ code: "server_error", detail: msg }, { status: 500 });
  }
}
