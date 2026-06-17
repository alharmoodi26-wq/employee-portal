import { NextRequest, NextResponse } from "next/server";
import { AdminInitError, getAdminDb } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, no-auth endpoint.
// Returns assessment metadata + questions WITHOUT correctAnswerIndex,
// so participants can't see the answers from the browser.

export async function GET(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8);
  const code = req.nextUrl.searchParams.get("code")?.trim() || "";
  console.log(`[pa-get:${reqId}] code="${code}"`);

  if (!code) {
    return NextResponse.json({ code: "missing_code" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection("assessments")
      .where("code", "==", code)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ code: "not_found" }, { status: 404 });
    }

    const docSnap = snap.docs[0];
    const data = docSnap.data();

    if (data.isActive === false) {
      return NextResponse.json({ code: "inactive" }, { status: 423 });
    }

    const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
    const sanitizedQuestions = rawQuestions.map((q: unknown, i: number) => {
      const item = (q ?? {}) as Record<string, unknown>;
      return {
        id: typeof item.id === "string" ? item.id : `q_${i}`,
        text: typeof item.text === "string" ? item.text : "",
        options: Array.isArray(item.options)
          ? (item.options as unknown[]).map((o) => (typeof o === "string" ? o : ""))
          : [],
        // NOTE: correctAnswerIndex is intentionally stripped — never sent to the client.
      };
    });

    if (sanitizedQuestions.length === 0) {
      return NextResponse.json({ code: "no_questions" }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      assessment: {
        id: docSnap.id,
        title: typeof data.title === "string" ? data.title : "Untitled Assessment",
        description: typeof data.description === "string" ? data.description : "",
        passingPercentage:
          typeof data.passingPercentage === "number" ? data.passingPercentage : 70,
        maxAttempts: typeof data.maxAttempts === "number" ? data.maxAttempts : 2,
        code: typeof data.code === "string" ? data.code : code,
        questions: sanitizedQuestions,
        isActive: data.isActive !== false,
      },
    });
  } catch (err) {
    if (err instanceof AdminInitError) {
      console.error(`[pa-get:${reqId}] admin init failed: ${err.kind} — ${err.message}`);
      return NextResponse.json(
        { code: "server_misconfigured", kind: err.kind, detail: err.message },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pa-get:${reqId}] error:`, msg);
    return NextResponse.json({ code: "server_error", detail: msg }, { status: 500 });
  }
}
