import { NextResponse } from "next/server";

// Sends a birthday card by email via Resend (same provider the system already
// uses in Firebase Functions). Requires RESEND_API_KEY and RESEND_FROM_EMAIL
// to be set in the environment (e.g. Vercel project env vars).
const DEFAULT_FROM_TEXT = "ABU NADER GROUP OF COMPANIES MANAGEMENT & STAFF";

export async function POST(request: Request) {
  try {
    const { to, name, birthday, imageBase64, mimeType, greeting } = await request.json();

    const approxBytes = typeof imageBase64 === "string"
      ? Math.round((imageBase64.length * 3) / 4)
      : 0;
    console.log("[birthday-card/send] incoming", {
      to,
      name,
      base64Len: typeof imageBase64 === "string" ? imageBase64.length : 0,
      approxImageKB: Math.round(approxBytes / 1024),
      mimeType,
    });

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
    // Resend caps total message size at ~40 MB; a base64 attachment near that
    // is almost certainly a payload problem worth reporting clearly.
    if (approxBytes > 18 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: "Card image is too large to email.",
          detail: `Attachment is ~${Math.round(approxBytes / 1024 / 1024)} MB.`,
        },
        { status: 413 }
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

    const safeName =
      typeof name === "string" && name.trim() ? name.trim() : "the employee";
    const birthdayLabel =
      typeof birthday === "string" && birthday.trim()
        ? birthday.trim()
        : "their upcoming date";
    const greetingText =
      typeof greeting === "string" && greeting.trim() ? greeting.trim() : "";
    const mime = mimeType === "image/png" ? "image/png" : "image/jpeg";

    // A warm, ready-to-send birthday email: the selected greeting up top,
    // the generated card embedded inline (as a data URI — some clients block
    // those, so the card is also attached as a regular file below), and the
    // company sign-off at the bottom.
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
        <div style="text-align:center;padding:28px 20px 6px;">
          <h1 style="margin:0;font-size:26px;line-height:1.3;color:#0f1c35;">🎉 Happy Birthday, ${escapeHtml(safeName)}!</h1>
        </div>
        ${
          greetingText
            ? `<p style="font-size:16px;line-height:1.7;text-align:center;color:#334155;padding:10px 24px 0;">${escapeHtml(greetingText)}</p>`
            : ""
        }
        <div style="text-align:center;padding:22px 24px 6px;">
          <img src="data:${mime};base64,${imageBase64}" alt="Birthday card for ${escapeHtml(safeName)}" style="max-width:100%;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,0.15);"/>
        </div>
        <p style="font-size:14px;line-height:1.6;text-align:center;color:#64748b;padding:6px 24px 0;">
          Birthday: <strong>${escapeHtml(birthdayLabel)}</strong>
        </p>
        <div style="margin-top:22px;padding:18px 24px 26px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="font-size:12px;letter-spacing:0.06em;color:#94a3b8;margin:0;text-transform:uppercase;">From</p>
          <p style="font-size:14px;font-weight:700;color:#0f1c35;margin:4px 0 0;">${escapeHtml(DEFAULT_FROM_TEXT)}</p>
        </div>
      </div>`;

    const ext = mime === "image/png" ? "png" : "jpg";
    console.log("[birthday-card/send] calling Resend", { from: fromEmail, to });

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: "Happy Birthday from Abu Nader Group of Companies! 🎉",
        html,
        attachments: [{ filename: `birthday-card.${ext}`, content: imageBase64 }],
      }),
    });

    const respText = await resp.text().catch(() => "");
    console.log("[birthday-card/send] Resend status", resp.status, respText);

    if (!resp.ok) {
      // Surface the exact provider error (e.g. domain not verified, invalid
      // from, rate limit) rather than a generic message.
      let providerMsg = respText;
      try {
        const parsed = JSON.parse(respText);
        providerMsg = parsed?.message || parsed?.error || respText;
      } catch {
        /* keep raw text */
      }
      return NextResponse.json(
        {
          error: `Resend rejected the email (HTTP ${resp.status}).`,
          detail: providerMsg,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[birthday-card/send] unexpected error", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Unexpected server error.",
        detail: e instanceof Error ? e.stack?.slice(0, 500) : String(e),
      },
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
