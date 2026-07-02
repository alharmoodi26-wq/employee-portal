"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buttonStyle,
  cardStyle,
  getThemePalette,
  inputStyle,
  smallButtonStyle,
  ToastType,
} from "./portal-utils";

// ── Settings (persisted in Firestore: config/birthdayCard) ───────────────
export type BirthdayCardSettings = {
  companyName: string;
  logoDataUrl: string; // base64 data URL; empty → default /eihg-logo.jpeg
  defaultMessage: string;
  primaryColor: string; // hex
  accentColor: string; // hex
  defaultTemplate: CardTemplateId;
};

export type CardTemplateId = "eihg" | "festive" | "minimal" | "luxe";

export const DEFAULT_BIRTHDAY_CARD_SETTINGS: BirthdayCardSettings = {
  companyName: "Emirates International Holding Group",
  logoDataUrl: "",
  defaultMessage:
    "Wishing you a wonderful birthday filled with joy, success, and happiness. Thank you for being a valued part of our team!",
  primaryColor: "#0f1c35",
  accentColor: "#f0c040",
  defaultTemplate: "eihg",
};

export type BirthdayPerson = {
  name: string;
  birthday: string; // YYYY-MM-DD
  photoUrl?: string;
};

// Employee directory entry (subset) used only to auto-fill the recipient email.
export type CardEmployee = { name: string; email: string };

// ── Landscape canvas dimensions (A4 landscape ratio) ─────────────────────
const CARD_W = 1600;
const CARD_H = 1131;

const TEMPLATES: { id: CardTemplateId; name: string; hint: string }[] = [
  { id: "eihg", name: "Executive Navy", hint: "Brand navy + gold" },
  { id: "festive", name: "Festive", hint: "Balloons & confetti" },
  { id: "minimal", name: "Minimal", hint: "Clean & elegant" },
  { id: "luxe", name: "Gold Luxe", hint: "Dark & premium" },
];

// ── Small drawing helpers ────────────────────────────────────────────────
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h.padEnd(6, "0").slice(0, 6),
    16
  );
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function drawCircularImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  name: string,
  cx: number,
  cy: number,
  radius: number,
  ring: string,
  ringWidth: number,
  fallbackBg: string
) {
  ctx.save();
  // ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius + ringWidth, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  // clip circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    // cover-fit the image into the circle
    const size = radius * 2;
    const scale = Math.max(size / img.width, size / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = fallbackBg;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("");
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${radius}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText(initials, cx, cy + 4);
  }
  ctx.restore();
}

// Wrap text within maxWidth, returns the y after the last line.
function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  align: CanvasTextAlign
): number {
  ctx.textAlign = align;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  // ellipsis if truncated
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    // only add ellipsis if we actually dropped words
    const rejoined = lines.join(" ");
    if (rejoined.length < text.length) lines[maxLines - 1] = last.trimEnd() + "…";
  }
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function formatBirthday(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  if (m < 0 || m > 11 || !d) return iso;
  return `${months[m]} ${d}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    // First try with CORS so the drawn image can be exported (toDataURL/toBlob).
    // If that fails (bucket without CORS headers), retry without CORS so the
    // photo still shows in the preview — export then falls back gracefully.
    const attempt = (useCors: boolean) => {
      const img = new Image();
      if (useCors) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => (useCors ? attempt(false) : resolve(null));
      img.src = src;
    };
    attempt(true);
  });
}

type DrawEnv = {
  W: number;
  H: number;
  primary: string;
  accent: string;
  companyName: string;
  message: string;
  name: string;
  dateLabel: string;
  photo: HTMLImageElement | null;
  logo: HTMLImageElement | null;
};

function drawLogoChip(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  x: number,
  y: number,
  maxH: number
) {
  if (!logo) return 0;
  const scale = maxH / logo.height;
  const w = logo.width * scale;
  ctx.drawImage(logo, x, y, w, maxH);
  return w;
}

function confetti(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  colors: string[],
  count: number,
  seed = 7
) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const c = colors[Math.floor(rnd() * colors.length)];
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.85;
    if (rnd() > 0.5) {
      ctx.beginPath();
      ctx.arc(x, y, 5 + rnd() * 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI);
      ctx.fillRect(-6, -3, 12, 6);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ── Template renderers ───────────────────────────────────────────────────
function drawEIHG(ctx: CanvasRenderingContext2D, e: DrawEnv) {
  const { W, H, primary, accent } = e;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0a1628");
  g.addColorStop(0.55, primary);
  g.addColorStop(1, "#1b2a4a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // gold top bar
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 16);
  confetti(ctx, W, 320, [accent, "#ffffff", hexToRgba(accent, 0.6)], 34);

  // left photo
  const cx = 380;
  const cy = H / 2 + 20;
  drawCircularImage(ctx, e.photo, e.name, cx, cy, 240, accent, 10, hexToRgba(accent, 0.9));

  // right content
  const rx = 720;
  // logo + company
  const logoW = drawLogoChip(ctx, e.logo, rx, 120, 66);
  ctx.fillStyle = "#cbd5e1";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "700 26px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(e.companyName, rx + (logoW ? logoW + 22 : 0), 153);

  ctx.fillStyle = accent;
  ctx.font = "900 30px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("✦ HAPPY BIRTHDAY ✦", rx, 300);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 78px 'Segoe UI', Arial, sans-serif";
  drawWrapped(ctx, e.name, rx, 400, W - rx - 90, 82, 2, "left");

  ctx.fillStyle = accent;
  ctx.font = "800 30px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`🎂  ${e.dateLabel}`, rx, 540);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "400 30px 'Segoe UI', Arial, sans-serif";
  drawWrapped(ctx, e.message, rx, 620, W - rx - 90, 44, 5, "left");

  // footer rule
  ctx.strokeStyle = hexToRgba(accent, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rx, H - 120);
  ctx.lineTo(W - 90, H - 120);
  ctx.stroke();
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 22px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`With warm wishes — ${e.companyName}`, rx, H - 80);
}

function drawFestive(ctx: CanvasRenderingContext2D, e: DrawEnv) {
  const { W, H, primary, accent } = e;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#7c3aed");
  g.addColorStop(1, "#ec4899");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // balloons
  const balloons = [
    { x: 150, y: 210, c: "#fde047" },
    { x: 300, y: 150, c: "#38bdf8" },
    { x: W - 180, y: 200, c: "#4ade80" },
    { x: W - 330, y: 140, c: "#fb7185" },
  ];
  balloons.forEach((b) => {
    ctx.fillStyle = b.c;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, 46, 58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexToRgba("#ffffff", 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + 58);
    ctx.quadraticCurveTo(b.x + 20, b.y + 130, b.x, b.y + 200);
    ctx.stroke();
  });
  confetti(ctx, W, H, ["#fde047", "#38bdf8", "#4ade80", "#fb7185", "#ffffff"], 46, 11);

  // white panel
  const pad = 90;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 28);
  ctx.fill();
  ctx.restore();

  const cx = 360;
  const cy = H / 2 + 10;
  drawCircularImage(ctx, e.photo, e.name, cx, cy, 210, accent, 10, primary);

  const rx = 640;
  drawLogoChip(ctx, e.logo, rx, 165, 56);
  ctx.fillStyle = "#7c3aed";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "900 56px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("Happy Birthday!", rx, 330);

  ctx.fillStyle = primary;
  ctx.font = "900 68px 'Segoe UI', Arial, sans-serif";
  drawWrapped(ctx, e.name, rx, 420, W - rx - pad - 30, 74, 2, "left");

  ctx.fillStyle = "#ec4899";
  ctx.font = "800 30px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`🎂  ${e.dateLabel}`, rx, 545);

  ctx.fillStyle = "#475569";
  ctx.font = "400 29px 'Segoe UI', Arial, sans-serif";
  drawWrapped(ctx, e.message, rx, 620, W - rx - pad - 30, 42, 4, "left");

  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 22px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(e.companyName, rx, H - 140);
}

function drawMinimal(ctx: CanvasRenderingContext2D, e: DrawEnv) {
  const { W, H, primary, accent } = e;
  ctx.fillStyle = "#faf7f2";
  ctx.fillRect(0, 0, W, H);
  // frame
  ctx.strokeStyle = primary;
  ctx.lineWidth = 3;
  ctx.strokeRect(46, 46, W - 92, H - 92);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(60, 60, W - 120, H - 120);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // logo + company centered top
  if (e.logo) {
    const maxH = 58;
    const scale = maxH / e.logo.height;
    const w = e.logo.width * scale;
    ctx.drawImage(e.logo, W / 2 - w / 2, 100, w, maxH);
  }
  ctx.fillStyle = primary;
  ctx.font = "700 24px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(e.companyName.toUpperCase(), W / 2, e.logo ? 200 : 130);

  // photo centered
  drawCircularImage(ctx, e.photo, e.name, W / 2, 430, 165, accent, 6, primary);

  ctx.fillStyle = accent;
  ctx.font = "800 30px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("HAPPY BIRTHDAY", W / 2, 660);

  ctx.fillStyle = primary;
  ctx.font = "900 66px 'Georgia', 'Segoe UI', serif";
  drawWrapped(ctx, e.name, W / 2, 730, W - 260, 70, 1, "center");

  ctx.fillStyle = "#64748b";
  ctx.font = "600 28px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`🎂  ${e.dateLabel}`, W / 2, 812);

  // small accent rule
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 40, 858);
  ctx.lineTo(W / 2 + 40, 858);
  ctx.stroke();

  ctx.fillStyle = "#475569";
  ctx.font = "400 28px 'Segoe UI', Arial, sans-serif";
  drawWrapped(ctx, e.message, W / 2, 910, W - 380, 40, 3, "center");
}

function drawLuxe(ctx: CanvasRenderingContext2D, e: DrawEnv) {
  const { W, H, accent } = e;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1a1a14");
  g.addColorStop(1, "#0e0e0a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // gold frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 50, W - 100, H - 100);
  // corner flourishes
  const corner = (cx: number, cy: number, dirX: number, dirY: number) => {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx + 70 * dirX, cy + 70 * dirY, 70, 0, Math.PI * 2);
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  corner(70, 70, 1, 1);
  corner(W - 70, 70, -1, 1);
  corner(70, H - 70, 1, -1);
  corner(W - 70, H - 70, -1, -1);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (e.logo) {
    const maxH = 56;
    const scale = maxH / e.logo.height;
    const w = e.logo.width * scale;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(e.logo, W / 2 - w / 2, 110, w, maxH);
    ctx.globalAlpha = 1;
  }

  drawCircularImage(ctx, e.photo, e.name, W / 2, 420, 168, accent, 5, "#2a2a1e");

  ctx.fillStyle = accent;
  ctx.font = "900 34px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("✦  HAPPY BIRTHDAY  ✦", W / 2, 650);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 66px 'Georgia', 'Segoe UI', serif";
  drawWrapped(ctx, e.name, W / 2, 726, W - 240, 70, 1, "center");

  ctx.fillStyle = accent;
  ctx.font = "700 28px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(`🎂  ${e.dateLabel}`, W / 2, 806);

  ctx.fillStyle = "#d6d3c4";
  ctx.font = "400 28px 'Segoe UI', Arial, sans-serif";
  drawWrapped(ctx, e.message, W / 2, 858, W - 360, 40, 3, "center");

  ctx.fillStyle = hexToRgba(accent, 0.8);
  ctx.font = "700 22px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(e.companyName, W / 2, H - 95);
}

function renderTemplate(
  ctx: CanvasRenderingContext2D,
  template: CardTemplateId,
  env: DrawEnv
) {
  ctx.clearRect(0, 0, env.W, env.H);
  if (template === "festive") drawFestive(ctx, env);
  else if (template === "minimal") drawMinimal(ctx, env);
  else if (template === "luxe") drawLuxe(ctx, env);
  else drawEIHG(ctx, env);
}

// ── Reusable UI pieces (theme-aware, layout via Tailwind) ────────────────
type Palette = ReturnType<typeof getThemePalette>;

function Section({
  label,
  hint,
  theme,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  theme: Palette;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3
          className="text-[13px] font-bold"
          style={{ color: theme.title }}
        >
          {label}
        </h3>
        {hint ? <span className="text-[11px]">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function ActionTile({
  onClick,
  icon,
  label,
  theme,
}: {
  onClick: () => void;
  icon: string;
  label: string;
  theme: Palette;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-2 text-[12px] font-semibold transition-colors"
      style={{
        border: `1px solid ${theme.cardBorder}`,
        background: theme.inputBg,
        color: theme.title,
      }}
    >
      <span className="text-[17px] leading-none">{icon}</span>
      {label}
    </button>
  );
}

// ── Preview + actions modal ──────────────────────────────────────────────
export function BirthdayCardModal({
  person,
  employees,
  settings,
  onClose,
  showToast,
}: {
  person: BirthdayPerson;
  employees: CardEmployee[];
  settings: BirthdayCardSettings;
  onClose: () => void;
  showToast: (type: ToastType, message: string) => void;
}) {
  const theme = getThemePalette();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [template, setTemplate] = useState<CardTemplateId>(
    settings.defaultTemplate
  );
  const [message, setMessage] = useState(settings.defaultMessage);
  const [busy, setBusy] = useState<string | null>(null);
  const [assets, setAssets] = useState<{
    photo: HTMLImageElement | null;
    logo: HTMLImageElement | null;
    ready: boolean;
  }>({ photo: null, logo: null, ready: false });

  // Auto-fill recipient email from the employee directory (case-insensitive).
  const matchedEmail = useMemo(() => {
    const n = person.name.trim().toLowerCase();
    return (
      employees.find((e) => e.name.trim().toLowerCase() === n)?.email || ""
    );
  }, [employees, person.name]);
  const [recipient, setRecipient] = useState(matchedEmail);
  useEffect(() => setRecipient(matchedEmail), [matchedEmail]);

  // Load photo + logo once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [photo, logo] = await Promise.all([
        loadImage(person.photoUrl || ""),
        loadImage(settings.logoDataUrl || "/eihg-logo.jpeg"),
      ]);
      if (alive) setAssets({ photo, logo, ready: true });
    })();
    return () => {
      alive = false;
    };
  }, [person.photoUrl, settings.logoDataUrl]);

  const dateLabel = useMemo(() => formatBirthday(person.birthday), [person.birthday]);

  // Re-render whenever inputs change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !assets.ready) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderTemplate(ctx, template, {
      W: CARD_W,
      H: CARD_H,
      primary: settings.primaryColor || "#0f1c35",
      accent: settings.accentColor || "#f0c040",
      companyName: settings.companyName || "",
      message,
      name: person.name,
      dateLabel,
      photo: assets.photo,
      logo: assets.logo,
    });
  }, [template, message, assets, settings, person.name, dateLabel]);

  const safeName = person.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Shown when a cross-origin photo taints the canvas (loaded without CORS):
  // the preview still displays the photo, but the pixels can't be read back.
  const TAINT_MSG =
    "The photo can't be exported due to cross-origin restrictions. It shows in the preview, but downloading or emailing requires the image host to allow CORS.";

  const getDataUrl = (): string => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    try {
      return canvas.toDataURL("image/png", 0.95);
    } catch {
      return ""; // tainted canvas
    }
  };

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas) return resolve(null);
        try {
          canvas.toBlob((b) => resolve(b), "image/png", 0.95);
        } catch {
          resolve(null); // tainted canvas
        }
      }),
    []
  );

  const downloadPng = async () => {
    const blob = await toBlob();
    if (!blob) return showToast("error", TAINT_MSG);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `birthday-${safeName}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", "Card downloaded (PNG).");
  };

  const downloadPdf = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = getDataUrl();
    if (!dataUrl) return showToast("error", TAINT_MSG);
    const w = window.open("", "_blank", "width=1100,height=800");
    if (!w) return showToast("error", "Please allow popups to save the PDF.");
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
<title>Birthday Card — ${person.name}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  html,body{margin:0;padding:0;background:#fff;}
  .wrap{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;}
  img{width:100%;height:auto;max-height:100vh;display:block;}
  @media print{ .bar{display:none!important;} }
  .bar{position:fixed;top:0;left:0;right:0;display:flex;gap:10px;justify-content:center;padding:12px;background:#0f1c35;}
  .bar button{border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;}
  .p{background:#f0c040;color:#0f1c35;} .c{background:rgba(255,255,255,.15);color:#fff;}
</style></head><body>
<div class="bar"><button class="c" onclick="window.close()">Close</button><button class="p" onclick="window.print()">Print / Save PDF</button></div>
<div class="wrap"><img src="${dataUrl}" alt="Birthday card"/></div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>
</body></html>`);
    w.document.close();
  };

  const shareCard = async () => {
    const blob = await toBlob();
    if (!blob) return showToast("error", "Could not render the card.");
    const file = new File([blob], `birthday-${safeName}.png`, {
      type: "image/png",
    });
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
    };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({
          files: [file],
          title: `Happy Birthday ${person.name}!`,
          text: message,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      // Fallback: download so the user can share manually.
      await downloadPng();
      showToast("success", "Sharing not supported here — card downloaded instead.");
    }
  };

  const sendEmail = async () => {
    if (!recipient.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient.trim())) {
      return showToast("error", "Enter a valid recipient email.");
    }
    const dataUrl = getDataUrl();
    if (!dataUrl) return showToast("error", TAINT_MSG);
    setBusy("email");
    try {
      const base64 = dataUrl.split(",")[1] || "";
      const res = await fetch("/api/birthday-card/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient.trim(),
          name: person.name,
          message,
          imageBase64: base64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to send email.");
      showToast("success", `Card sent to ${recipient.trim()}.`);
    } catch (e) {
      showToast(
        "error",
        e instanceof Error ? e.message : "Could not send the email."
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-5"
      style={{
        background: "rgba(8,12,22,0.72)",
        backdropFilter: "blur(3px)",
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative grid w-full max-w-7xl grid-cols-1 overflow-y-auto rounded-2xl lg:h-[94vh] lg:grid-cols-[minmax(0,1.55fr)_minmax(380px,1fr)] lg:overflow-hidden"
        style={{
          maxHeight: "94vh",
          background: theme.cardBackground,
          border: `1px solid ${theme.cardBorder}`,
          boxShadow: "0 40px 90px rgba(2,6,23,0.55)",
        }}
      >
        {/* Floating close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-bold transition-colors"
          style={{
            background: "rgba(15,23,42,0.55)",
            color: "#fff",
            backdropFilter: "blur(4px)",
          }}
        >
          ✕
        </button>

        {/* ── LEFT · Preview (always visible, never overlapped) ── */}
        <div
          className="flex items-center justify-center p-6 sm:p-8 lg:p-10"
          style={{
            background:
              "radial-gradient(120% 120% at 50% 0%, #16213c 0%, #0b1220 70%)",
          }}
        >
          <div className="w-full max-w-[860px]">
            <div
              className="overflow-hidden rounded-xl"
              style={{
                aspectRatio: `${CARD_W} / ${CARD_H}`,
                boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#0b1220",
              }}
            >
              <canvas
                ref={canvasRef}
                width={CARD_W}
                height={CARD_H}
                className="block h-full w-full"
              />
            </div>
            <p className="mt-3 text-center text-[11px] font-medium tracking-wide text-slate-400">
              Live preview · A4 landscape · {person.name}
            </p>
          </div>
        </div>

        {/* ── RIGHT · Controls (internal scroll only) ── */}
        <div
          className="flex min-h-0 flex-col"
          style={{ borderLeft: `1px solid ${theme.cardBorder}` }}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-start gap-3 px-6 py-4 sm:px-7"
            style={{ borderBottom: `1px solid ${theme.cardBorder}` }}
          >
            <div className="min-w-0">
              <h2
                className="truncate text-[17px] font-extrabold leading-tight"
                style={{ color: theme.title }}
              >
                🎉 Birthday Card
              </h2>
              <p
                className="mt-0.5 text-[12px]"
                style={{ color: theme.subtleText }}
              >
                Personalize, download, or send the card
              </p>
            </div>
          </div>

          {/* Scrollable settings */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5 sm:px-7">
            <Section label="Template" theme={theme}>
              <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-2">
                {TEMPLATES.map((t) => {
                  const active = t.id === template;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTemplate(t.id)}
                      className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors"
                      style={{
                        border: `1.5px solid ${active ? "#6366f1" : theme.cardBorder}`,
                        background: active
                          ? "rgba(99,102,241,0.10)"
                          : theme.inputBg,
                        color: active ? "#6366f1" : theme.title,
                      }}
                    >
                      <span className="text-[13px] font-bold">{t.name}</span>
                      <span
                        className="text-[11px]"
                        style={{ color: active ? "#6366f1" : theme.subtleText }}
                      >
                        {t.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section label="Greeting message" theme={theme}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full"
                style={{
                  ...inputStyle(),
                  resize: "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.55,
                }}
              />
            </Section>

            <Section
              label="Recipient email"
              theme={theme}
              hint={
                matchedEmail ? (
                  <span style={{ color: "#16a34a", fontWeight: 700 }}>
                    ✓ auto-filled
                  </span>
                ) : (
                  <span style={{ color: theme.subtleText }}>enter manually</span>
                )
              }
            >
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="name@company.com"
                type="email"
                className="w-full"
                style={inputStyle()}
              />
            </Section>
          </div>

          {/* Sticky footer actions */}
          <div
            className="shrink-0 space-y-2.5 px-6 py-4 sm:px-7"
            style={{
              borderTop: `1px solid ${theme.cardBorder}`,
              background: theme.softCardBackground,
            }}
          >
            <button
              onClick={sendEmail}
              disabled={busy === "email"}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-bold text-white transition-opacity"
              style={{
                background: "linear-gradient(135deg,#6366f1,#4f46e5)",
                boxShadow: "0 10px 22px rgba(99,102,241,0.32)",
                opacity: busy === "email" ? 0.7 : 1,
              }}
            >
              {busy === "email" ? "Sending…" : "✉  Send by Email"}
            </button>
            <div className="grid grid-cols-3 gap-2.5">
              <ActionTile onClick={downloadPng} icon="⬇" label="PNG" theme={theme} />
              <ActionTile onClick={downloadPdf} icon="📄" label="PDF" theme={theme} />
              <ActionTile onClick={shareCard} icon="🔗" label="Share" theme={theme} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings modal ───────────────────────────────────────────────────────
async function fileToCompressedDataUrl(file: File, maxDim = 400): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  // PNG to preserve logo transparency.
  return canvas.toDataURL("image/png");
}

export function BirthdayCardSettingsModal({
  settings,
  onSave,
  onClose,
  showToast,
}: {
  settings: BirthdayCardSettings;
  onSave: (s: BirthdayCardSettings) => Promise<void>;
  onClose: () => void;
  showToast: (type: ToastType, message: string) => void;
}) {
  const theme = getThemePalette();
  const [form, setForm] = useState<BirthdayCardSettings>(settings);
  const [saving, setSaving] = useState(false);
  const logoInput = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof BirthdayCardSettings>(
    k: K,
    v: BirthdayCardSettings[K]
  ) => setForm((f) => ({ ...f, [k]: v }));

  const onLogo = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      return showToast("error", "Please choose an image file.");
    }
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      set("logoDataUrl", dataUrl);
    } catch {
      showToast("error", "Could not read that image.");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(form);
      showToast("success", "Birthday-card settings saved.");
      onClose();
    } catch (e) {
      showToast(
        "error",
        e instanceof Error ? e.message : "Could not save settings."
      );
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: theme.subtleText }}>
        {label}
      </span>
      {node}
    </div>
  );

  const logoSrc = form.logoDataUrl || "/eihg-logo.jpeg";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        background: "rgba(8,12,22,0.66)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...cardStyle(),
          width: "min(560px, 100%)",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: 20,
          display: "grid",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 17, color: theme.title }}>
            ⚙ Birthday Card Settings
          </div>
          <button onClick={onClose} style={smallButtonStyle()}>
            ✕
          </button>
        </div>

        {field(
          "Company name",
          <input
            value={form.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            style={inputStyle()}
          />
        )}

        {field(
          "Company logo",
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 90,
                height: 54,
                borderRadius: 8,
                border: `1px solid ${theme.cardBorder}`,
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt="logo"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                onLogo(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => logoInput.current?.click()}
              style={smallButtonStyle()}
            >
              Upload logo
            </button>
            {form.logoDataUrl && (
              <button
                onClick={() => set("logoDataUrl", "")}
                style={{ ...smallButtonStyle(), color: "#ef4444" }}
              >
                Reset
              </button>
            )}
          </div>
        )}

        {field(
          "Default greeting message",
          <textarea
            value={form.defaultMessage}
            onChange={(e) => set("defaultMessage", e.target.value)}
            rows={3}
            style={{
              ...inputStyle(),
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field(
            "Primary color",
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => set("primaryColor", e.target.value)}
                style={{ width: 44, height: 38, borderRadius: 8, border: "none", background: "none", cursor: "pointer" }}
              />
              <input
                value={form.primaryColor}
                onChange={(e) => set("primaryColor", e.target.value)}
                style={{ ...inputStyle(), fontFamily: "monospace" }}
              />
            </div>
          )}
          {field(
            "Accent color",
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => set("accentColor", e.target.value)}
                style={{ width: 44, height: 38, borderRadius: 8, border: "none", background: "none", cursor: "pointer" }}
              />
              <input
                value={form.accentColor}
                onChange={(e) => set("accentColor", e.target.value)}
                style={{ ...inputStyle(), fontFamily: "monospace" }}
              />
            </div>
          )}
        </div>

        {field(
          "Default template",
          <select
            value={form.defaultTemplate}
            onChange={(e) => set("defaultTemplate", e.target.value as CardTemplateId)}
            style={inputStyle()}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.hint}
              </option>
            ))}
          </select>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} disabled={saving} style={buttonStyle(false)}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              ...buttonStyle(true),
              background: "linear-gradient(135deg,#6366f1,#4f46e5)",
              color: "#fff",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
