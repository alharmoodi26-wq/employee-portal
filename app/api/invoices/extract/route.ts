import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "../../../lib/firebase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const MODEL_NAME = "gemini-2.5-flash";

type ExtractedFields = {
  supplier_name: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  stamp_date: string | null;
  total_amount: number | null;
  currency: string | null;
  trn_or_vat_number: string | null;
  confidence: Record<string, number>;
  warnings: string[];
};

const PROMPT = `You are an invoice extraction engine. Extract these fields from the invoice image or PDF.

CRITICAL DATE RULES — read carefully:

There are TWO different dates we need, and they MUST NOT be confused:

1) "invoice_date" = the PRINTED date at the TOP of the invoice document
   - This is the date the supplier issued the invoice.
   - It is usually printed near the supplier letterhead, near "Date:", "Invoice Date:", "التاريخ:".
   - Normalize to YYYY-MM-DD.
   - If unclear, return null and add a warning. Do NOT guess.

2) "stamp_date" = the date written or stamped INSIDE a received/approval stamp
   - Look for stamps or boxes containing words like:
     "GOODS RECEIVED", "RECEIVED", "APPROVED", "Received by", "Name & Signature",
     "GRN", "استلمت", "تم الاستلام", "معتمد".
   - Inside or right next to that stamp, find the date and use THAT as stamp_date.
   - Normalize to YYYY-MM-DD.
   - If the stamp date is covered by a signature, smudged, partial, or unclear, return null
     and add a warning. Do NOT guess.

NEVER put the stamp date in invoice_date.
NEVER put the top invoice date in stamp_date.
If you only see ONE date and there is no stamp, put it in invoice_date and leave stamp_date null.

Other fields:
- supplier_name: the company that issued the invoice (seller / vendor name at the top)
- customer_name: the company or person the invoice is billed to ("Bill To", "Customer", "العميل")
- invoice_number: the invoice number / reference
- total_amount: the final total amount as a number (no currency symbol, no commas)
- currency: 3-letter currency code if visible (e.g. AED, USD, SAR, EUR)
- trn_or_vat_number: TRN or VAT registration number if visible (UAE TRN is 15 digits)

General rules:
- If a value is not clearly visible, return null. Do NOT guess.
- Provide a confidence score from 0 to 1 for each field based on how certain you are.
- Add short warnings (strings) for fields that are unclear, ambiguous, partial, or where a stamp/signature obscures the value.

Return ONLY valid JSON in this exact shape (no markdown, no commentary):
{
  "supplier_name": null,
  "customer_name": null,
  "invoice_number": null,
  "invoice_date": null,
  "stamp_date": null,
  "total_amount": null,
  "currency": null,
  "trn_or_vat_number": null,
  "confidence": {
    "supplier_name": 0,
    "customer_name": 0,
    "invoice_number": 0,
    "invoice_date": 0,
    "stamp_date": 0,
    "total_amount": 0,
    "currency": 0,
    "trn_or_vat_number": 0
  },
  "warnings": []
}`;

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(`[extract:${reqId}] start`);

  const caller = await verifyRequestAuth(req);
  if (!caller) {
    console.warn(`[extract:${reqId}] unauthorized: invalid or missing token`);
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`[extract:${reqId}] GEMINI_API_KEY present=${Boolean(apiKey)} model=${MODEL_NAME}`);
  if (!apiKey) {
    return NextResponse.json({ code: "server_misconfigured" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error(`[extract:${reqId}] formData parse failed:`, err);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    console.warn(`[extract:${reqId}] missing file field`);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }

  const fileName = (file as File).name || "(no name)";
  const fileSize = file.size;
  const fileType = (file.type || "").toLowerCase();
  console.log(`[extract:${reqId}] file: name="${fileName}" size=${fileSize} type="${fileType}"`);

  if (fileSize === 0) {
    console.warn(`[extract:${reqId}] empty file`);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }
  if (fileSize > MAX_SIZE) {
    console.warn(`[extract:${reqId}] file too large: ${fileSize} bytes (max ${MAX_SIZE})`);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }
  if (!fileType.startsWith("image/") && fileType !== "application/pdf") {
    console.warn(`[extract:${reqId}] unsupported file type: ${fileType}`);
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
        temperature: 0.1,
      },
    });

    console.log(`[extract:${reqId}] calling Gemini model=${MODEL_NAME}`);
    const t0 = Date.now();
    const result = await model.generateContent([
      { inlineData: { mimeType: fileType, data: base64 } },
      { text: PROMPT },
    ]);
    const elapsedMs = Date.now() - t0;

    const text = result.response.text();
    console.log(
      `[extract:${reqId}] Gemini OK elapsed=${elapsedMs}ms responseLen=${text?.length ?? 0}`
    );

    let parsed: ExtractedFields;
    try {
      parsed = JSON.parse(text);
    } catch (jsonErr) {
      console.error(
        `[extract:${reqId}] JSON parse failed:`,
        jsonErr,
        "raw head:",
        text?.slice(0, 500)
      );
      return NextResponse.json({ code: "extraction_failed" }, { status: 500 });
    }

    const safe: ExtractedFields = {
      supplier_name: typeof parsed.supplier_name === "string" ? parsed.supplier_name : null,
      customer_name: typeof parsed.customer_name === "string" ? parsed.customer_name : null,
      invoice_number: typeof parsed.invoice_number === "string" ? parsed.invoice_number : null,
      invoice_date: typeof parsed.invoice_date === "string" ? parsed.invoice_date : null,
      stamp_date: typeof parsed.stamp_date === "string" ? parsed.stamp_date : null,
      total_amount: typeof parsed.total_amount === "number" ? parsed.total_amount : null,
      currency: typeof parsed.currency === "string" ? parsed.currency : null,
      trn_or_vat_number: typeof parsed.trn_or_vat_number === "string" ? parsed.trn_or_vat_number : null,
      confidence: parsed.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {},
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.filter((w) => typeof w === "string")
        : [],
    };

    if (safe.invoice_date && !/^\d{4}-\d{2}-\d{2}$/.test(safe.invoice_date)) {
      safe.warnings.push("Invoice date is not in YYYY-MM-DD format — please review.");
    }
    if (safe.stamp_date && !/^\d{4}-\d{2}-\d{2}$/.test(safe.stamp_date)) {
      safe.warnings.push("Stamp date is not in YYYY-MM-DD format — please review.");
    }
    if (safe.total_amount !== null && (Number.isNaN(safe.total_amount) || safe.total_amount <= 0)) {
      safe.warnings.push("Total amount looks invalid — please review.");
    }

    return NextResponse.json({ success: true, ...safe });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const status = extractStatusCode(error);
    const isQuota =
      status === 429 || /quota|rate.?limit|resource_exhausted|exceeded/i.test(raw);

    if (isQuota) {
      console.error(`[extract:${reqId}] Gemini quota/rate limit. status=${status} msg=${raw}`);
      return NextResponse.json({ code: "quota_exceeded" }, { status: 429 });
    }

    console.error(`[extract:${reqId}] Gemini error. status=${status} msg=${raw}`);
    return NextResponse.json({ code: "extraction_failed" }, { status: 500 });
  }
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
