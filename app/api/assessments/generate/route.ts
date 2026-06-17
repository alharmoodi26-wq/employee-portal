import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB — slides/docs are usually larger than invoices
const MODEL_NAME = "gemini-2.5-flash";

type GeneratedQuestion = {
  questionText: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string | null;
};

type GeneratedDraft = {
  title: string;
  description: string;
  passingPercentage: number;
  maxAttempts: number;
  questions: GeneratedQuestion[];
};

const PROMPT = `You are an assessment-generation engine. Read the document carefully and produce a multiple-choice quiz that tests the reader's understanding of its content.

REQUIREMENTS:
- Generate between 5 and 20 questions covering the most important facts and concepts.
- Each question is single-answer, multiple choice.
- Each question MUST have between 2 and 4 options.
- Exactly ONE option must be correct. The other options should be plausible distractors written in the same style and length as the correct one.
- Avoid trick questions, double negatives, and "All of the above" / "None of the above" — they make grading ambiguous.
- Make every question and option self-contained — do not say "see page 3" or refer to other questions.
- Match the language of the source document (Arabic source → Arabic questions; English source → English questions). Mixed-language source → English by default.
- Provide a short 1-sentence "explanation" for each question that justifies the correct answer.
- Suggest a sensible quiz "title" derived from the document subject.
- Default "passingPercentage" to 70 unless the document specifies otherwise.
- Default "maxAttempts" to 2.

INSTRUCTIONS (the "description" field) — read this rule carefully:
1. FIRST, scan the document for explicit assessment instructions. Look for sections labeled:
   - "Instructions", "Assessment Instructions", "Quiz Instructions", "Test Instructions",
     "Guidelines", "Directions", "How to take this test/quiz/assessment",
     "تعليمات", "تعليمات الاختبار", "إرشادات", "كيفية الإجابة".
   Also look for the document's own preamble that explicitly tells the participant how to take the assessment (time limit, allowed materials, marking scheme, what to do with each question, etc).
2. IF such instructions are present in the document:
   - Extract them and put them in "description" verbatim, or as a faithful close paraphrase that preserves the same meaning, tone, and language.
   - Do NOT replace, rewrite with different wording, summarize away important details, or substitute generic guidance.
   - Do NOT mix the document's instructions with extra advice you invented.
3. IF the document contains NO instructions at all:
   - You MAY write a short, neutral default in "description", such as:
     "Please read each question carefully and select the best answer."
   - Keep it generic and one or two sentences.
4. Never invent quiz rules (passing score, time limit, attempt count) that are not stated in the document — those go in their own fields, not in "description".

OUTPUT:
Return ONLY valid JSON in this exact shape (no markdown fences, no commentary):
{
  "title": "string",
  "description": "string",
  "passingPercentage": 70,
  "maxAttempts": 2,
  "questions": [
    {
      "questionText": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswerIndex": 0,
      "explanation": "string"
    }
  ]
}

Rules:
- correctAnswerIndex is a 0-based integer pointing to the correct option in the "options" array.
- If you cannot generate at least 3 meaningful questions from the document, return: {"title":"","description":"","passingPercentage":70,"maxAttempts":2,"questions":[]}.
- Never invent facts that are not in the document.`;

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(`[assess-gen:${reqId}] start`);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    console.warn(`[assess-gen:${reqId}] unauthorized: missing bearer token`);
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`[assess-gen:${reqId}] GEMINI_API_KEY present=${Boolean(apiKey)} model=${MODEL_NAME}`);
  if (!apiKey) {
    return NextResponse.json({ code: "server_misconfigured" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error(`[assess-gen:${reqId}] formData parse failed:`, err);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    console.warn(`[assess-gen:${reqId}] missing file field`);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }

  const fileName = (file as File).name || "(no name)";
  const fileSize = file.size;
  const fileType = (file.type || "").toLowerCase();
  console.log(
    `[assess-gen:${reqId}] file: name="${fileName}" size=${fileSize} type="${fileType}"`
  );

  if (fileSize === 0) {
    console.warn(`[assess-gen:${reqId}] empty file`);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }
  if (fileSize > MAX_SIZE) {
    console.warn(`[assess-gen:${reqId}] file too large: ${fileSize} bytes (max ${MAX_SIZE})`);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }
  if (!fileType.startsWith("image/") && fileType !== "application/pdf") {
    console.warn(`[assess-gen:${reqId}] unsupported file type: ${fileType}`);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 16000,
      },
    });

    console.log(`[assess-gen:${reqId}] calling Gemini`);
    const t0 = Date.now();
    const result = await model.generateContent([
      { inlineData: { mimeType: fileType, data: base64 } },
      { text: PROMPT },
    ]);
    const elapsedMs = Date.now() - t0;

    const text = result.response.text();
    console.log(
      `[assess-gen:${reqId}] Gemini OK elapsed=${elapsedMs}ms responseLen=${text?.length ?? 0}`
    );

    let parsed: GeneratedDraft;
    try {
      parsed = JSON.parse(text);
    } catch (jsonErr) {
      console.error(
        `[assess-gen:${reqId}] JSON parse failed:`,
        jsonErr,
        "raw head:",
        text?.slice(0, 500)
      );
      return NextResponse.json({ code: "extraction_failed" }, { status: 500 });
    }

    const sanitized = sanitizeDraft(parsed);
    if (!sanitized) {
      console.warn(`[assess-gen:${reqId}] AI returned no usable questions`);
      return NextResponse.json({ code: "no_questions" }, { status: 422 });
    }

    return NextResponse.json({ success: true, draft: sanitized });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const status = extractStatusCode(error);
    const isQuota =
      status === 429 || /quota|rate.?limit|resource_exhausted|exceeded/i.test(raw);

    if (isQuota) {
      console.error(`[assess-gen:${reqId}] Gemini quota/rate limit. status=${status} msg=${raw}`);
      return NextResponse.json({ code: "quota_exceeded" }, { status: 429 });
    }

    console.error(`[assess-gen:${reqId}] Gemini error. status=${status} msg=${raw}`);
    return NextResponse.json({ code: "extraction_failed" }, { status: 500 });
  }
}

function sanitizeDraft(raw: unknown): GeneratedDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const title = typeof r.title === "string" ? r.title.trim() : "";
  const description = typeof r.description === "string" ? r.description.trim() : "";
  const passingPercentage =
    typeof r.passingPercentage === "number" && r.passingPercentage >= 0 && r.passingPercentage <= 100
      ? Math.round(r.passingPercentage)
      : 70;
  const maxAttempts =
    typeof r.maxAttempts === "number" && r.maxAttempts >= 1 && r.maxAttempts <= 10
      ? Math.round(r.maxAttempts)
      : 2;

  const rawQuestions = Array.isArray(r.questions) ? r.questions : [];
  const questions: GeneratedQuestion[] = [];

  for (const q of rawQuestions) {
    if (!q || typeof q !== "object") continue;
    const qr = q as Record<string, unknown>;
    const questionText = typeof qr.questionText === "string" ? qr.questionText.trim() : "";
    if (!questionText) continue;

    const rawOptions = Array.isArray(qr.options) ? qr.options : [];
    const options = rawOptions
      .map((o) => (typeof o === "string" ? o.trim() : ""))
      .filter((o) => o.length > 0);
    if (options.length < 2 || options.length > 4) continue;

    const correctAnswerIndex =
      typeof qr.correctAnswerIndex === "number" &&
      qr.correctAnswerIndex >= 0 &&
      qr.correctAnswerIndex < options.length
        ? Math.round(qr.correctAnswerIndex)
        : -1;
    if (correctAnswerIndex < 0) continue;

    const explanation =
      typeof qr.explanation === "string" && qr.explanation.trim().length > 0
        ? qr.explanation.trim()
        : null;

    questions.push({ questionText, options, correctAnswerIndex, explanation });
  }

  if (questions.length === 0) return null;

  return {
    title: title || "Untitled Assessment",
    description,
    passingPercentage,
    maxAttempts,
    questions,
  };
}

function extractStatusCode(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  const msg = typeof e.message === "string" ? e.message : "";
  const match = msg.match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : null;
}
