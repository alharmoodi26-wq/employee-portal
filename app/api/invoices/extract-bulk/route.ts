import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const MODEL_NAME = "gemini-2.5-flash";

type BulkInvoice = {
  first_page: number | null;
  last_page: number | null;
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

type BulkResponse = {
  total_invoices_detected: number;
  invoices: BulkInvoice[];
};

const PROMPT = `You are a bulk-invoice extraction engine. The PDF may contain MULTIPLE separate invoices.

YOUR JOB:
1) Identify every distinct invoice in the document.
2) For each one, record its page range and extract its fields.
3) Return an array of invoices in document order.

How to detect a NEW invoice boundary:
- A new supplier name / letterhead / logo appears at the top of a page
- A header like "INVOICE", "TAX INVOICE", "فاتورة" appears
- The "Bill To" / "Customer" block changes
- A previous invoice ended with a clear "Total" or "Grand Total" line
If you are uncertain about where one invoice ends and the next begins, set low confidence for first_page/last_page and add a warning.

For EACH invoice extract:
- first_page (1-indexed integer, the first page in the PDF where this invoice starts)
- last_page (1-indexed integer, the last page of this invoice — same as first_page for single-page invoices)
- supplier_name: the company that issued the invoice
- customer_name: the company or person billed to (Bill To / Customer / العميل)
- invoice_number: invoice number or reference (used for duplicate detection)
- invoice_date: the printed date AT THE TOP of the invoice (supplier issue date). YYYY-MM-DD.
- stamp_date: the date INSIDE a received/approval stamp ("GOODS RECEIVED", "RECEIVED", "APPROVED", "Received by", "Name & Signature", "GRN", "استلمت", "تم الاستلام", "معتمد"). YYYY-MM-DD.
- total_amount: final total as a number
- currency: 3-letter code if visible
- trn_or_vat_number: TRN/VAT registration if visible

Critical rules:
- NEVER confuse invoice_date (top of document) with stamp_date (inside a stamp).
- If a value is not clearly visible, return null. Do NOT guess.
- Provide a confidence score 0..1 per field.
- Add short warnings (strings) for fields that are unclear or partially covered.
- If you cannot determine first_page or last_page with confidence, set them to null and add a warning.

Return ONLY valid JSON in this exact shape (no markdown, no commentary):
{
  "total_invoices_detected": 0,
  "invoices": [
    {
      "first_page": null,
      "last_page": null,
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
        "trn_or_vat_number": 0,
        "page_range": 0
      },
      "warnings": []
    }
  ]
}`;

export async function POST(req: NextRequest) {
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(`[extract-bulk:${reqId}] start`);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    console.warn(`[extract-bulk:${reqId}] unauthorized`);
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  console.log(
    `[extract-bulk:${reqId}] GEMINI_API_KEY present=${Boolean(apiKey)} model=${MODEL_NAME}`
  );
  if (!apiKey) {
    return NextResponse.json({ code: "server_misconfigured" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.error(`[extract-bulk:${reqId}] formData parse failed:`, err);
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }

  const fileName = (file as File).name || "(no name)";
  const fileSize = file.size;
  const fileType = (file.type || "").toLowerCase();
  console.log(
    `[extract-bulk:${reqId}] file: name="${fileName}" size=${fileSize} type="${fileType}"`
  );

  if (fileSize === 0 || fileSize > MAX_SIZE) {
    return NextResponse.json({ code: "file_invalid" }, { status: 400 });
  }
  if (fileType !== "application/pdf") {
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
        maxOutputTokens: 32000,
      },
    });

    console.log(`[extract-bulk:${reqId}] calling Gemini`);
    const t0 = Date.now();
    const result = await model.generateContent([
      { inlineData: { mimeType: fileType, data: base64 } },
      { text: PROMPT },
    ]);
    const elapsedMs = Date.now() - t0;

    const text = result.response.text();
    console.log(
      `[extract-bulk:${reqId}] Gemini OK elapsed=${elapsedMs}ms responseLen=${text?.length ?? 0}`
    );

    let parsed: BulkResponse;
    try {
      parsed = JSON.parse(text);
    } catch (jsonErr) {
      console.error(
        `[extract-bulk:${reqId}] JSON parse failed:`,
        jsonErr,
        "raw head:",
        text?.slice(0, 500)
      );
      return NextResponse.json({ code: "extraction_failed" }, { status: 500 });
    }

    const safeInvoices: BulkInvoice[] = Array.isArray(parsed.invoices)
      ? parsed.invoices.map(sanitizeBulkInvoice).slice(0, 50)
      : [];

    return NextResponse.json({
      success: true,
      total_invoices_detected: safeInvoices.length,
      invoices: safeInvoices,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const status = extractStatusCode(error);
    const isQuota =
      status === 429 || /quota|rate.?limit|resource_exhausted|exceeded/i.test(raw);

    if (isQuota) {
      console.error(
        `[extract-bulk:${reqId}] Gemini quota/rate limit. status=${status} msg=${raw}`
      );
      return NextResponse.json({ code: "quota_exceeded" }, { status: 429 });
    }

    console.error(`[extract-bulk:${reqId}] Gemini error. status=${status} msg=${raw}`);
    return NextResponse.json({ code: "extraction_failed" }, { status: 500 });
  }
}

function sanitizeBulkInvoice(raw: unknown): BulkInvoice {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    first_page: typeof r.first_page === "number" ? r.first_page : null,
    last_page: typeof r.last_page === "number" ? r.last_page : null,
    supplier_name: typeof r.supplier_name === "string" ? r.supplier_name : null,
    customer_name: typeof r.customer_name === "string" ? r.customer_name : null,
    invoice_number: typeof r.invoice_number === "string" ? r.invoice_number : null,
    invoice_date: typeof r.invoice_date === "string" ? r.invoice_date : null,
    stamp_date: typeof r.stamp_date === "string" ? r.stamp_date : null,
    total_amount: typeof r.total_amount === "number" ? r.total_amount : null,
    currency: typeof r.currency === "string" ? r.currency : null,
    trn_or_vat_number: typeof r.trn_or_vat_number === "string" ? r.trn_or_vat_number : null,
    confidence:
      r.confidence && typeof r.confidence === "object"
        ? (r.confidence as Record<string, number>)
        : {},
    warnings: Array.isArray(r.warnings)
      ? (r.warnings as unknown[]).filter((w): w is string => typeof w === "string")
      : [],
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
