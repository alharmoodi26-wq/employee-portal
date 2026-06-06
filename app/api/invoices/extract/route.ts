import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

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
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server not configured: GEMINI_API_KEY is missing." },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024} MB).` },
      { status: 400 }
    );
  }

  const mime = (file.type || "").toLowerCase();
  if (!mime.startsWith("image/") && mime !== "application/pdf") {
    return NextResponse.json(
      { error: "Only images and PDF files are supported." },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");

  try {
    console.log(`[extract] start: mime=${mime} size=${file.size}`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const result = await model.generateContent([
      { inlineData: { mimeType: mime, data: base64 } },
      { text: PROMPT },
    ]);

    const text = result.response.text();
    console.log(`[extract] raw response length=${text?.length ?? 0}`);
    let parsed: ExtractedFields;
    try {
      parsed = JSON.parse(text);
    } catch (jsonErr) {
      console.error("[extract] JSON parse failed:", jsonErr, "raw:", text?.slice(0, 500));
      return NextResponse.json(
        { error: "AI returned invalid JSON. Try a clearer image." },
        { status: 502 }
      );
    }

    // Basic shape sanity — fill in safe defaults
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
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((w) => typeof w === "string") : [],
    };

    // Light validation hints
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
    // Detect quota / rate-limit errors and return a short stable code instead of
    // Google's verbose multi-line message.
    const raw = error instanceof Error ? error.message : String(error);
    const status = extractStatusCode(error);
    const isQuota =
      status === 429 ||
      /quota|rate.?limit|resource_exhausted|exceeded/i.test(raw);

    if (isQuota) {
      console.error("[extract] quota exceeded:", raw);
      return NextResponse.json(
        { error: "quota_exceeded", code: "quota_exceeded" },
        { status: 429 }
      );
    }

    console.error("[extract] error:", raw);
    return NextResponse.json(
      { error: "extraction_failed", code: "extraction_failed" },
      { status: 500 }
    );
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
