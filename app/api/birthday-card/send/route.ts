import { NextResponse } from "next/server";

// Sends a birthday card by email via Resend (same provider the system already
// uses in Firebase Functions). Requires RESEND_API_KEY and RESEND_FROM_EMAIL
// to be set in the environment (e.g. Vercel project env vars).
export async function POST(request: Request) {
  try {
    const { to, name, message, imageBase64 } = await request.json();

    if (typeof to !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json(
        { error: "A valid recipient email is required." },
        { status: 400 }
      );
    }
    if (typeof imageBase64 !== "string" || imageBase64.length < 100) {
      return NextResponse.json(
        { error: "Card image is missing." },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
      return NextResponse.json(
        {
          error:
            "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in the environment.",
        },
        { status: 500 }
      );
    }

    const safeName = typeof name === "string" && name.trim() ? name.trim() : "you";
    const greeting =
      typeof message === "string" && message.trim()
        ? message.trim()
        : "Wishing you a very happy birthday!";

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
        <p style="font-size:16px;line-height:1.6;">Dear ${escapeHtml(safeName)},</p>
        <p style="font-size:16px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(greeting)}</p>
        <p style="font-size:14px;color:#64748b;">Your birthday card is attached. 🎉</p>
      </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: `🎉 Happy Birthday, ${safeName}!`,
        html,
        attachments: [
          {
            filename: "birthday-card.png",
            content: imageBase64,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: "Email provider rejected the request.", detail },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
