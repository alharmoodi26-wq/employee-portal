"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buttonStyle,
  cardStyle,
  getThemePalette,
  inputStyle,
  smallButtonStyle,
  ToastType,
} from "./portal-utils";

// ── Settings (persisted in Firestore: config/birthdayCard) ───────────────
export type CardTemplateId =
  | "blue-balloons"
  | "dark-blue"
  | "gold"
  | "green"
  | "modern-corporate"
  | "pink-balloons"
  | "purple"
  | "rose-gold"
  | "floral"
  | "elegant";

export type BirthdayCardSettings = {
  fromText: string;
  hrEmail: string; // where the internal HR notification is sent
  defaultTemplate: CardTemplateId;
  randomTemplate: boolean;
  greetings: string[];
  defaultGreeting: string;
  randomGreeting: boolean;
  // Legacy fields kept only so old Firestore documents keep spreading
  // cleanly without crashing — no longer read by the UI.
  companyName?: string;
  logoDataUrl?: string;
  defaultMessage?: string;
  primaryColor?: string;
  accentColor?: string;
};

export type BirthdayPerson = {
  name: string;
  birthday: string; // YYYY-MM-DD
  photoUrl?: string;
  gender?: "male" | "female";
};

const DEFAULT_GREETINGS: string[] = [
  "Wishing you a wonderful birthday and a successful year ahead.",
  "Happy Birthday! Wishing you happiness, health, and success.",
  "Have an amazing birthday filled with joy and happiness.",
  "Wishing you all the best on your special day.",
  "May your birthday bring you happiness and success throughout the year.",
];

export const DEFAULT_BIRTHDAY_CARD_SETTINGS: BirthdayCardSettings = {
  fromText: "ABU NADER GROUP OF COMPANIES MANAGEMENT & STAFF",
  hrEmail: "",
  defaultTemplate: "modern-corporate",
  randomTemplate: true,
  greetings: DEFAULT_GREETINGS,
  defaultGreeting: DEFAULT_GREETINGS[0],
  randomGreeting: true,
};

// ── Landscape canvas dimensions (A4 landscape) ────────────────────────────
// Logical drawing size; the backing canvas is rendered at RENDER_SCALE× this
// for crisp photos and text in the exported PNG/PDF.
const CARD_W = 1600;
const CARD_H = 1131;
const RENDER_SCALE = 2;

// ── Type system (3 roles) ─────────────────────────────────────────────────
const UTILITY_FONT = "'Trebuchet MS','Segoe UI',Arial,sans-serif";
const SERIF_FONT = "Georgia,'Times New Roman',serif";
const SCRIPT_FONT = "'Brush Script MT','Segoe Script',cursive";

// ── Template registry (data, not draw functions) ──────────────────────────
type DecoKind = "balloons" | "confetti" | "floral" | "corners" | "sparkle" | "none";

type CardTemplate = {
  id: CardTemplateId;
  name: string;
  gender: "male" | "female";
  bg: string[];
  bgDiagonal?: boolean;
  panel: boolean;
  panelColor?: string;
  ink: string;
  accent: string;
  sub: string;
  ring: string;
  fallback: string;
  deco: DecoKind;
  decoColors: string[];
  serif: boolean;
};

const TEMPLATES: CardTemplate[] = [
  {
    id: "blue-balloons", name: "Blue Balloons", gender: "male",
    bg: ["#eaf3ff", "#cfe4ff"], panel: true, panelColor: "#ffffff",
    ink: "#0b2a5b", accent: "#1f6feb", sub: "#3f5f8a", ring: "#1f6feb", fallback: "#1f6feb",
    deco: "balloons", decoColors: ["#1f6feb", "#4f9dff", "#88c0ff", "#ffd166"], serif: false,
  },
  {
    id: "dark-blue", name: "Dark Blue", gender: "male",
    bg: ["#0a1a3a", "#12294f", "#0a1a3a"], bgDiagonal: true, panel: false,
    ink: "#ffffff", accent: "#9cc4ff", sub: "#c3d4ef", ring: "#9cc4ff", fallback: "#1b3a6b",
    deco: "sparkle", decoColors: ["#ffffff", "#9cc4ff", "#ffd36b"], serif: false,
  },
  {
    id: "gold", name: "Gold", gender: "male",
    bg: ["#fff8e6", "#f7e6bf"], panel: true, panelColor: "#fffaf0",
    ink: "#5a4410", accent: "#c9971a", sub: "#8a6d25", ring: "#c9971a", fallback: "#c9971a",
    deco: "sparkle", decoColors: ["#e6c257", "#f3d98a", "#ffffff"], serif: true,
  },
  {
    id: "green", name: "Green", gender: "male",
    bg: ["#e8f8ef", "#bfe9cf"], panel: true, panelColor: "#ffffff",
    ink: "#0f3d24", accent: "#12a150", sub: "#3a6b4e", ring: "#12a150", fallback: "#12a150",
    deco: "confetti", decoColors: ["#12a150", "#4cc47f", "#a7e8c1", "#ffd166"], serif: false,
  },
  {
    id: "modern-corporate", name: "Modern Corporate", gender: "male",
    bg: ["#f5f7fa", "#e8edf3"], panel: false,
    ink: "#0f1c35", accent: "#2563eb", sub: "#5b6b85", ring: "#2563eb", fallback: "#2563eb",
    deco: "corners", decoColors: ["#2563eb", "#cbd5e1"], serif: false,
  },
  {
    id: "pink-balloons", name: "Pink Balloons", gender: "female",
    bg: ["#fff0f6", "#ffd6e8"], panel: true, panelColor: "#ffffff",
    ink: "#7a1745", accent: "#e83e8c", sub: "#9d5476", ring: "#e83e8c", fallback: "#e83e8c",
    deco: "balloons", decoColors: ["#e83e8c", "#ff8ac0", "#ffc2dd", "#c084fc"], serif: false,
  },
  {
    id: "purple", name: "Purple", gender: "female",
    bg: ["#f3ebff", "#dcc7ff"], panel: true, panelColor: "#ffffff",
    ink: "#3d1a6b", accent: "#7c3aed", sub: "#6b4e9d", ring: "#7c3aed", fallback: "#7c3aed",
    deco: "confetti", decoColors: ["#7c3aed", "#a978ff", "#d4b8ff", "#ffd166"], serif: false,
  },
  {
    id: "rose-gold", name: "Rose Gold", gender: "female",
    bg: ["#fdeee9", "#f6d9cf"], panel: true, panelColor: "#fdf3ee",
    ink: "#6b3b2e", accent: "#b76e79", sub: "#9a6b5e", ring: "#c08497", fallback: "#c08497",
    deco: "sparkle", decoColors: ["#e8b7a5", "#f3d5c9", "#ffffff"], serif: true,
  },
  {
    id: "floral", name: "Floral", gender: "female",
    bg: ["#fbf3ee", "#f3e3ea"], panel: true, panelColor: "#fffaf7",
    ink: "#5a3b52", accent: "#d46a9a", sub: "#8a6377", ring: "#d46a9a", fallback: "#d46a9a",
    deco: "floral", decoColors: ["#f2a9c4", "#f6c9b8", "#cdeac0", "#ffffff"], serif: true,
  },
  {
    id: "elegant", name: "Elegant", gender: "female",
    bg: ["#faf5f0", "#f0e6dc"], panel: false,
    ink: "#3a2f2a", accent: "#b08968", sub: "#7a6a5f", ring: "#b08968", fallback: "#b08968",
    deco: "corners", decoColors: ["#b08968", "#e6d8c8"], serif: true,
  },
];

function getTemplate(id: CardTemplateId): CardTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES.find((t) => t.id === "modern-corporate")!;
}

// Old stored ids ("eihg","festive","minimal","luxe") — or anything else
// invalid — fall back to the first template of the requested gender, or a
// neutral default. Use this wherever a stored template id is read.
function normalizeTemplate(id: string | undefined | null, gender: "male" | "female"): CardTemplateId {
  const exact = TEMPLATES.find((t) => t.id === id && t.gender === gender);
  if (exact) return exact.id;
  const firstOfGender = TEMPLATES.find((t) => t.gender === gender);
  if (firstOfGender) return firstOfGender.id;
  return "modern-corporate";
}

function pickRandomTemplateId(gender: "male" | "female"): CardTemplateId {
  const pool = TEMPLATES.filter((t) => t.gender === gender);
  if (!pool.length) return normalizeTemplate(undefined, gender);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ── Small drawing helpers (reused by the card renderer) ───────────────────
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

// Canvas letterSpacing isn't in every TS lib target yet, and is a no-op on
// canvases that don't support it — which is fine.
function setLetterSpacing(ctx: CanvasRenderingContext2D, px: string) {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = px;
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

// Pure line-wrapping (no drawing) — shared by drawWrapped and fitDisplayText.
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
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
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    const rejoined = lines.join(" ");
    if (rejoined.length < text.length) lines[maxLines - 1] = last.trimEnd() + "…";
  }
  return lines;
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
  const lines = wrapLines(ctx, text, maxWidth, maxLines);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

// Shrinks the display name from maxFont→minFont until it fits on one line;
// falls back to a 2-line wrap at minFont if it still doesn't fit.
function fitDisplayText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFont: number,
  minFont: number,
  fontFamily: string,
  weight: number
): { fontSize: number; lines: string[] } {
  for (let size = maxFont; size >= minFont; size -= 2) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) {
      return { fontSize: size, lines: [text] };
    }
  }
  ctx.font = `${weight} ${minFont}px ${fontFamily}`;
  return { fontSize: minFont, lines: wrapLines(ctx, text, maxWidth, 2) };
}

function isSameOrigin(src: string): boolean {
  try {
    return new URL(src, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

function imgFromUrl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

// Loads an image so it can be drawn AND exported (PNG/PDF/email) without
// tainting the canvas:
//   • data URLs / same-origin images → drawn directly (already clean)
//   • cross-origin images (Firebase Storage, etc.) → fetched through our
//     same-origin proxy and inlined as a data URL, which never taints.
// Falls back to a direct (display-only) load as a last resort, and logs the
// exact failing URL/host to the console for diagnostics.
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null;
  if (src.startsWith("data:") || isSameOrigin(src)) {
    return imgFromUrl(src);
  }
  try {
    const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(src)}`);
    if (res.ok) {
      const dataUrl = await blobToDataUrl(await res.blob());
      return imgFromUrl(dataUrl);
    }
    console.warn(
      `[BirthdayCard] image proxy returned ${res.status} for host "${
        (() => {
          try {
            return new URL(src).host;
          } catch {
            return "?";
          }
        })()
      }" — ${src}`
    );
  } catch (e) {
    console.warn(`[BirthdayCard] image proxy fetch error for ${src}`, e);
  }
  // Last resort: display the photo even though export will be limited.
  console.warn(`[BirthdayCard] falling back to direct (non-exportable) load: ${src}`);
  return imgFromUrl(src);
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

// ── Decorations — tasteful, mostly top/edges, never over the photo/name ───
function drawBalloonsDeco(ctx: CanvasRenderingContext2D, W: number, _H: number, colors: string[]) {
  const balloons = [
    { x: W * 0.14, y: 60, s: 0.55 },
    { x: W * 0.28, y: 8, s: 0.4 },
    { x: W * 0.72, y: 18, s: 0.45 },
    { x: W * 0.86, y: 68, s: 0.6 },
  ];
  balloons.forEach((b, i) => {
    const c = colors[i % colors.length];
    const rx = 46 * b.s;
    const ry = 58 * b.s;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = hexToRgba(c, 0.4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + ry);
    ctx.quadraticCurveTo(b.x + 14, b.y + ry + 70, b.x, b.y + ry + 140);
    ctx.stroke();
  });
}

function drawSparkleDeco(ctx: CanvasRenderingContext2D, W: number, H: number, colors: string[]) {
  let s = 21;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const drawStar = (x: number, y: number, r: number, color: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.25, -r * 0.25);
    ctx.lineTo(r, 0);
    ctx.lineTo(r * 0.25, r * 0.25);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.25, r * 0.25);
    ctx.lineTo(-r, 0);
    ctx.lineTo(-r * 0.25, -r * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  for (let i = 0; i < 24; i++) {
    const topBand = rnd() < 0.55;
    let x: number, y: number;
    if (topBand) {
      x = rnd() * W;
      y = rnd() * 210;
    } else {
      x = rnd() < 0.5 ? rnd() * 110 : W - rnd() * 110;
      y = 210 + rnd() * (H - 420);
    }
    drawStar(x, y, 6 + rnd() * 9, colors[Math.floor(rnd() * colors.length)]);
  }
  ctx.globalAlpha = 1;
}

function drawFlower(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, petal: string, center: string) {
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.fillStyle = petal;
    ctx.globalAlpha = 0.85;
    ctx.ellipse(0, -r * 0.6, r * 0.42, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.fillStyle = center;
  ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFloralDeco(ctx: CanvasRenderingContext2D, W: number, _H: number, colors: string[]) {
  const center = colors[3] || "#ffffff";
  drawFlower(ctx, 128, 118, 58, colors[0], center);
  drawFlower(ctx, W - 148, 88, 44, colors[1] || colors[0], center);
  drawFlower(ctx, W - 86, 198, 32, colors[2] || colors[0], center);
  drawFlower(ctx, 58, 226, 28, colors[1] || colors[0], center);
}

function drawCornersDeco(ctx: CanvasRenderingContext2D, W: number, H: number, colors: string[]) {
  const inset = 44;
  ctx.strokeStyle = hexToRgba(colors[0], 0.5);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  ctx.strokeStyle = hexToRgba(colors[1] || colors[0], 0.32);
  ctx.strokeRect(inset + 10, inset + 10, W - (inset + 10) * 2, H - (inset + 10) * 2);
  const cl = 46;
  ctx.strokeStyle = colors[0];
  ctx.lineWidth = 3;
  const corner = (x: number, y: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y + cl * dy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cl * dx, y);
    ctx.stroke();
  };
  corner(inset, inset, 1, 1);
  corner(W - inset, inset, -1, 1);
  corner(inset, H - inset, 1, -1);
  corner(W - inset, H - inset, -1, -1);
}

function paintDecoration(ctx: CanvasRenderingContext2D, tpl: CardTemplate, W: number, H: number) {
  switch (tpl.deco) {
    case "balloons":
      drawBalloonsDeco(ctx, W, H, tpl.decoColors);
      break;
    case "confetti":
      confetti(ctx, W, 260, tpl.decoColors, 40, 17);
      break;
    case "sparkle":
      drawSparkleDeco(ctx, W, H, tpl.decoColors);
      break;
    case "floral":
      drawFloralDeco(ctx, W, H, tpl.decoColors);
      break;
    case "corners":
      drawCornersDeco(ctx, W, H, tpl.decoColors);
      break;
    default:
      break;
  }
}

function paintBackground(ctx: CanvasRenderingContext2D, W: number, H: number, tpl: CardTemplate) {
  const grad = tpl.bgDiagonal
    ? ctx.createLinearGradient(0, 0, W, H)
    : ctx.createLinearGradient(0, 0, 0, H);
  const denom = Math.max(tpl.bg.length - 1, 1);
  tpl.bg.forEach((c, i) => grad.addColorStop(i / denom, c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function paintPanel(ctx: CanvasRenderingContext2D, W: number, H: number, color: string) {
  const pad = 66;
  ctx.save();
  ctx.shadowColor = "rgba(15,23,42,0.16)";
  ctx.shadowBlur = 46;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = color;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 36);
  ctx.fill();
  ctx.restore();
}

// ── Birthday date/day/title computation ───────────────────────────────────
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function computeBirthdayFields(iso: string, name: string): {
  dateLabel: string;
  dayLabel: string;
  titleLabel: string;
} {
  const trimmedName = (name || "").trim();
  const upper = trimmedName.toUpperCase();
  const possessive = upper ? (upper.endsWith("S") ? `${upper}'` : `${upper}'S`) : "";
  const titleLabel = possessive ? `${possessive} BIRTHDAY` : "BIRTHDAY";

  const parts = (iso || "").split("-");
  if (parts.length < 3) return { dateLabel: "", dayLabel: "", titleLabel };
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (!Number.isFinite(month) || month < 0 || month > 11 || !Number.isFinite(day) || day < 1 || day > 31) {
    return { dateLabel: "", dayLabel: "", titleLabel };
  }
  const year = new Date().getFullYear();
  const d = new Date(year, month, day);
  const dateLabel = `${String(day).padStart(2, "0")} ${MONTHS[month]} ${year}`;
  const dayLabel = WEEKDAYS[d.getDay()];
  return { dateLabel, dayLabel, titleLabel };
}

// ── The generic card renderer — one function paints all 10 templates ──────
type DrawEnv = {
  W: number;
  H: number;
  name: string;
  dateLabel: string;
  dayLabel: string;
  titleLabel: string;
  fromText: string;
  photo: HTMLImageElement | null;
};

// Landscape composition: a large ringed photo anchors the left column, and
// the full text stack (date → day → title → name → signature → from) is
// centered in the right column. The whole text block is vertically centered
// as a unit (two-pass: measure, then draw) so it fills the frame evenly
// alongside the photo instead of leaving empty bands top/bottom.
function renderCard(ctx: CanvasRenderingContext2D, tpl: CardTemplate, env: DrawEnv) {
  const { W, H } = env;
  ctx.clearRect(0, 0, W, H);
  paintBackground(ctx, W, H, tpl);
  if (tpl.panel) paintPanel(ctx, W, H, tpl.panelColor || "#ffffff");
  paintDecoration(ctx, tpl, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // ── Left column — circular ringed photo ──
  const photoRadius = 290;
  const ringW = 16;
  const photoCenterX = 110 + photoRadius + ringW;
  const photoCenterY = H / 2;
  drawCircularImage(ctx, env.photo, env.name, photoCenterX, photoCenterY, photoRadius, tpl.ring, ringW, tpl.fallback);

  // ── Right column — text stack ──
  const textLeft = photoCenterX + photoRadius + ringW + 70;
  const textRight = W - 110;
  const cx = (textLeft + textRight) / 2;
  const maxW = Math.max(280, textRight - textLeft);

  const dateH = 40;
  const dayH = 52;

  ctx.font = `800 30px ${UTILITY_FONT}`;
  setLetterSpacing(ctx, "2px");
  const titleLines = env.titleLabel ? wrapLines(ctx, env.titleLabel, maxW, 2) : [];
  setLetterSpacing(ctx, "0px");
  const titleLineHeight = 40;
  const titleBlockH = titleLines.length * titleLineHeight;

  const nameFontFamily = tpl.serif ? SERIF_FONT : UTILITY_FONT;
  const nameWeight = tpl.serif ? 700 : 900;
  const { fontSize: nameFontSize, lines: nameLines } = fitDisplayText(
    ctx, env.name, maxW, 80, 48, nameFontFamily, nameWeight
  );
  const nameLineHeight = nameFontSize * 1.15;
  const nameBlockH = nameLines.length * nameLineHeight;

  const { fontSize: happyFontSize, lines: happyLines } = fitDisplayText(
    ctx, "Happy Birthday", maxW, 78, 46, SCRIPT_FONT, 400
  );
  const happyLineHeight = happyFontSize * 1.08;
  const happyBlockH = happyLines.length * happyLineHeight;

  ctx.font = `800 21px ${UTILITY_FONT}`;
  const fromLines = wrapLines(ctx, (env.fromText || "").toUpperCase(), maxW, 2);
  const fromLineHeight = 27;
  const fromBlockH = fromLines.length * fromLineHeight;
  const fromLabelH = 24;

  const gapAfterTitle = 46;
  const gapAfterName = 42;
  const gapAfterHappy = 40;
  const gapBeforeFromText = 30;

  const totalH =
    dateH + dayH +
    titleBlockH + gapAfterTitle +
    nameBlockH + gapAfterName +
    happyBlockH + gapAfterHappy +
    fromLabelH + gapBeforeFromText + fromBlockH;

  let cursor = Math.max(80, (H - totalH) / 2);

  // 1) Date — "07 JULY 2026"
  if (env.dateLabel) {
    ctx.fillStyle = tpl.sub;
    ctx.font = `700 26px ${UTILITY_FONT}`;
    setLetterSpacing(ctx, "3px");
    ctx.fillText(env.dateLabel, cx, cursor);
    setLetterSpacing(ctx, "0px");
  }
  cursor += dateH;

  // 2) Day — "Tuesday"
  if (env.dayLabel) {
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = tpl.sub;
    ctx.font = `600 23px ${UTILITY_FONT}`;
    ctx.fillText(env.dayLabel, cx, cursor);
    ctx.globalAlpha = 1;
  }
  cursor += dayH;

  // 3) Birthday title — "NAME'S BIRTHDAY"
  ctx.fillStyle = tpl.accent;
  ctx.font = `800 30px ${UTILITY_FONT}`;
  setLetterSpacing(ctx, "2px");
  drawWrapped(ctx, env.titleLabel, cx, cursor, maxW, titleLineHeight, 2, "center");
  setLetterSpacing(ctx, "0px");
  cursor += titleBlockH + gapAfterTitle;

  // 4) Large employee name
  ctx.fillStyle = tpl.ink;
  ctx.font = `${nameWeight} ${nameFontSize}px ${nameFontFamily}`;
  nameLines.forEach((ln, i) => ctx.fillText(ln, cx, cursor + i * nameLineHeight));
  cursor += nameBlockH + gapAfterName;

  // 5) "Happy Birthday" signature — always present, hand-script
  ctx.fillStyle = tpl.accent;
  ctx.font = `400 ${happyFontSize}px ${SCRIPT_FONT}`;
  happyLines.forEach((ln, i) => ctx.fillText(ln, cx, cursor + i * happyLineHeight));
  cursor += happyBlockH + gapAfterHappy;

  // 6) From block
  ctx.fillStyle = tpl.sub;
  ctx.font = `700 18px ${UTILITY_FONT}`;
  setLetterSpacing(ctx, "2px");
  ctx.fillText("FROM:", cx, cursor);
  setLetterSpacing(ctx, "0px");
  cursor += gapBeforeFromText;
  ctx.fillStyle = tpl.ink;
  ctx.font = `800 21px ${UTILITY_FONT}`;
  drawWrapped(ctx, (env.fromText || "").toUpperCase(), cx, cursor, maxW, fromLineHeight, 2, "center");
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
        <h3 className="text-[13px] font-bold" style={{ color: theme.title }}>
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

function SwitchToggle({
  checked,
  onChange,
  label,
  theme,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  theme: Palette;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 transition-colors"
      style={{ border: `1px solid ${theme.cardBorder}`, background: theme.inputBg }}
    >
      <span className="text-[12.5px] font-bold" style={{ color: theme.title }}>
        {label}
      </span>
      <span
        className="relative inline-block shrink-0 rounded-full transition-colors"
        style={{ width: 38, height: 22, background: checked ? "#6366f1" : theme.cardBorder }}
      >
        <span
          className="absolute top-[2px] rounded-full bg-white transition-all"
          style={{ width: 18, height: 18, left: checked ? 18 : 2 }}
        />
      </span>
    </button>
  );
}

function GenderToggle({
  value,
  onChange,
  theme,
}: {
  value: "male" | "female";
  onChange: (g: "male" | "female") => void;
  theme: Palette;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {(["male", "female"] as const).map((g) => {
        const active = value === g;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            className="rounded-xl py-2.5 text-[13px] font-bold transition-colors"
            style={{
              border: `1.5px solid ${active ? "#6366f1" : theme.cardBorder}`,
              background: active ? "rgba(99,102,241,0.10)" : theme.inputBg,
              color: active ? "#6366f1" : theme.title,
            }}
          >
            {g === "male" ? "♂ Male" : "♀ Female"}
          </button>
        );
      })}
    </div>
  );
}

// ── Preview + actions modal ──────────────────────────────────────────────
export function BirthdayCardModal({
  person,
  settings,
  onClose,
  showToast,
}: {
  person: BirthdayPerson;
  settings: BirthdayCardSettings;
  onClose: () => void;
  showToast: (type: ToastType, message: string) => void;
}) {
  const theme = getThemePalette();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gender, setGender] = useState<"male" | "female">(person.gender ?? "male");

  const [randomTemplateOn, setRandomTemplateOn] = useState(settings.randomTemplate ?? true);
  const [template, setTemplate] = useState<CardTemplateId>(() => {
    const g = person.gender ?? "male";
    return (settings.randomTemplate ?? true)
      ? pickRandomTemplateId(g)
      : normalizeTemplate(settings.defaultTemplate, g);
  });

  const didMountGenderEffect = useRef(false);
  useEffect(() => {
    if (!didMountGenderEffect.current) {
      didMountGenderEffect.current = true;
      return;
    }
    setTemplate((prev) => {
      if (randomTemplateOn) return pickRandomTemplateId(gender);
      const stillValid = TEMPLATES.some((t) => t.id === prev && t.gender === gender);
      return stillValid ? prev : normalizeTemplate(settings.defaultTemplate, gender);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender]);

  const toggleRandomTemplate = (next: boolean) => {
    setRandomTemplateOn(next);
    if (next) setTemplate(pickRandomTemplateId(gender));
  };

  const genderTemplates = useMemo(() => TEMPLATES.filter((t) => t.gender === gender), [gender]);
  const currentTemplate = useMemo(() => getTemplate(template), [template]);

  const greetingsList = useMemo(
    () => (settings.greetings && settings.greetings.length ? settings.greetings : DEFAULT_GREETINGS),
    [settings.greetings]
  );
  const pickRandomGreeting = () =>
    greetingsList[Math.floor(Math.random() * greetingsList.length)] ?? DEFAULT_GREETINGS[0];

  const [randomGreetingOn, setRandomGreetingOn] = useState(settings.randomGreeting ?? true);
  const [greeting, setGreeting] = useState<string>(() =>
    (settings.randomGreeting ?? true)
      ? pickRandomGreeting()
      : settings.defaultGreeting || greetingsList[0] || DEFAULT_GREETINGS[0]
  );

  const toggleRandomGreeting = (next: boolean) => {
    setRandomGreetingOn(next);
    if (next) setGreeting(pickRandomGreeting());
  };

  const [busy, setBusy] = useState<string | null>(null);
  const [assets, setAssets] = useState<{ photo: HTMLImageElement | null; ready: boolean }>({
    photo: null,
    ready: false,
  });

  // The card is emailed to the HR team (an internal notification), so default
  // the recipient to the configured HR address — not the employee.
  const [recipient, setRecipient] = useState(settings.hrEmail || "");
  useEffect(() => setRecipient(settings.hrEmail || ""), [settings.hrEmail]);

  // Load the employee photo once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const photo = await loadImage(person.photoUrl || "");
      if (alive) setAssets({ photo, ready: true });
    })();
    return () => {
      alive = false;
    };
  }, [person.photoUrl]);

  const fields = useMemo(
    () => computeBirthdayFields(person.birthday, person.name),
    [person.birthday, person.name]
  );

  // Re-render whenever inputs change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !assets.ready) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Render into a high-resolution backing store with high-quality resampling
    // so employee photos and text stay sharp in the exported PNG/PDF.
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    renderCard(ctx, getTemplate(template), {
      W: CARD_W,
      H: CARD_H,
      name: person.name,
      dateLabel: fields.dateLabel,
      dayLabel: fields.dayLabel,
      titleLabel: fields.titleLabel,
      fromText: settings.fromText || DEFAULT_BIRTHDAY_CARD_SETTINGS.fromText,
      photo: assets.photo,
    });
  }, [template, assets, fields, settings.fromText, person.name]);

  const safeName = person.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Shown when a cross-origin photo taints the canvas (loaded without CORS):
  // the preview still displays the photo, but the pixels can't be read back.
  const TAINT_MSG =
    "The photo can't be exported due to cross-origin restrictions. It shows in the preview, but downloading or emailing requires the image host to allow CORS.";

  const getDataUrl = (type = "image/png", quality = 0.95): string => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    try {
      return canvas.toDataURL(type, quality);
    } catch {
      return ""; // tainted canvas
    }
  };

  const toBlob = () =>
    new Promise<Blob | null>((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      try {
        canvas.toBlob((b) => resolve(b), "image/png", 0.95);
      } catch {
        resolve(null); // tainted canvas
      }
    });

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
          text: greeting,
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
    // Use a JPEG for the attachment — a full-res PNG can exceed the API
    // request-body limit and fail before ever reaching Resend.
    const jpegDataUrl = getDataUrl("image/jpeg", 0.9);
    if (!jpegDataUrl) return showToast("error", TAINT_MSG);
    const base64 = jpegDataUrl.split(",")[1] || "";
    console.log(
      `[BirthdayCard] emailing to ${recipient.trim()} — attachment ~${Math.round(
        (base64.length * 3) / 4 / 1024
      )} KB`
    );

    setBusy("email");
    try {
      const res = await fetch("/api/birthday-card/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient.trim(),
          name: person.name,
          birthday: fields.dateLabel || person.birthday,
          imageBase64: base64,
          mimeType: "image/jpeg",
          greeting,
        }),
      });

      // Read the raw body first so we can surface non-JSON errors (e.g. a 413
      // payload-too-large page) instead of a generic message.
      const raw = await res.text();
      let data: { error?: string; detail?: string } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        /* non-JSON response */
      }

      if (!res.ok) {
        const full =
          [data.error, data.detail].filter(Boolean).join(" — ") ||
          raw ||
          `HTTP ${res.status}`;
        console.error("[BirthdayCard] email failed", {
          status: res.status,
          error: data.error,
          detail: data.detail,
          raw: raw.slice(0, 1000),
        });
        throw new Error(`(${res.status}) ${full}`);
      }

      // Close the modal first, then show the success toast on the main page so
      // it isn't hidden behind the modal overlay.
      onClose();
      showToast("success", `Birthday card sent to HR (${recipient.trim()}).`);
      return;
    } catch (e) {
      console.error("[BirthdayCard] sendEmail error", e);
      showToast(
        "error",
        (e instanceof Error ? e.message : "Could not send the email.").slice(
          0,
          400
        )
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
          <div className="w-full max-w-[900px]">
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
                width={CARD_W * RENDER_SCALE}
                height={CARD_H * RENDER_SCALE}
                className="block h-full w-full"
              />
            </div>
            <p className="mt-3 text-center text-[11px] font-medium tracking-wide text-slate-400">
              Live preview · Landscape card · {person.name}
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
            <Section
              label="Recipient's gender"
              theme={theme}
              hint={<span style={{ color: theme.subtleText }}>Filters templates</span>}
            >
              <GenderToggle value={gender} onChange={setGender} theme={theme} />
            </Section>

            <Section label="Template" theme={theme}>
              <div className="space-y-2.5">
                <SwitchToggle
                  checked={randomTemplateOn}
                  onChange={toggleRandomTemplate}
                  label="Random template"
                  theme={theme}
                />
                {randomTemplateOn ? (
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-3"
                    style={{ border: `1px solid ${theme.cardBorder}`, background: theme.inputBg }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: currentTemplate.accent,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        className="truncate text-[13px] font-extrabold"
                        style={{ color: theme.title }}
                      >
                        {currentTemplate.name}
                      </span>
                    </div>
                    <button
                      onClick={() => setTemplate(pickRandomTemplateId(gender))}
                      style={smallButtonStyle()}
                    >
                      🎲 Reshuffle
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {genderTemplates.map((t) => {
                      const active = t.id === template;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTemplate(t.id)}
                          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors"
                          style={{
                            border: `1.5px solid ${active ? "#6366f1" : theme.cardBorder}`,
                            background: active ? "rgba(99,102,241,0.10)" : theme.inputBg,
                            color: active ? "#6366f1" : theme.title,
                          }}
                        >
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              background: t.accent,
                              flexShrink: 0,
                            }}
                          />
                          <span className="text-[12.5px] font-bold">{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Section>

            <Section
              label="Greeting"
              theme={theme}
              hint={
                <span style={{ color: theme.subtleText }}>Included in the email, not on the card</span>
              }
            >
              <div className="space-y-2.5">
                <SwitchToggle
                  checked={randomGreetingOn}
                  onChange={toggleRandomGreeting}
                  label="Random greeting"
                  theme={theme}
                />
                {randomGreetingOn ? (
                  <div
                    className="flex items-start justify-between gap-3 rounded-xl px-3 py-3"
                    style={{ border: `1px solid ${theme.cardBorder}`, background: theme.inputBg }}
                  >
                    <p className="text-[13px] leading-snug" style={{ color: theme.title }}>
                      {greeting}
                    </p>
                    <button
                      onClick={() => setGreeting(pickRandomGreeting())}
                      style={smallButtonStyle()}
                    >
                      🎲
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={greetingsList.includes(greeting) ? greeting : ""}
                      onChange={(e) => e.target.value && setGreeting(e.target.value)}
                      style={inputStyle()}
                    >
                      <option value="">Custom / choose a preset…</option>
                      {greetingsList.map((g, i) => (
                        <option key={i} value={g}>
                          {g.length > 70 ? `${g.slice(0, 70)}…` : g}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={greeting}
                      onChange={(e) => setGreeting(e.target.value)}
                      rows={3}
                      className="w-full"
                      style={{
                        ...inputStyle(),
                        resize: "vertical",
                        fontFamily: "inherit",
                        lineHeight: 1.5,
                      }}
                    />
                  </div>
                )}
              </div>
            </Section>

            <Section
              label="Send to (HR team)"
              theme={theme}
              hint={
                settings.hrEmail ? (
                  <span style={{ color: "#16a34a", fontWeight: 700 }}>
                    ✓ from settings
                  </span>
                ) : (
                  <span style={{ color: theme.subtleText }}>
                    set a default in ⚙ Card Settings
                  </span>
                )
              }
            >
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="hr-team@company.com"
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
  const [form, setForm] = useState<BirthdayCardSettings>(() => ({
    ...DEFAULT_BIRTHDAY_CARD_SETTINGS,
    ...settings,
    defaultTemplate: normalizeTemplate(settings.defaultTemplate, "male"),
  }));
  const [greetingsText, setGreetingsText] = useState(
    (settings.greetings && settings.greetings.length ? settings.greetings : DEFAULT_GREETINGS).join("\n")
  );
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof BirthdayCardSettings>(
    k: K,
    v: BirthdayCardSettings[K]
  ) => setForm((f) => ({ ...f, [k]: v }));

  const currentGreetingsList = useMemo(() => {
    const list = greetingsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : DEFAULT_GREETINGS;
  }, [greetingsText]);

  const save = async () => {
    const finalGreetings = currentGreetingsList;
    const finalDefaultGreeting = finalGreetings.includes(form.defaultGreeting)
      ? form.defaultGreeting
      : finalGreetings[0];
    setSaving(true);
    try {
      await onSave({
        ...form,
        greetings: finalGreetings,
        defaultGreeting: finalDefaultGreeting,
      });
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
          "From (shown on the card & email)",
          <input
            value={form.fromText}
            onChange={(e) => set("fromText", e.target.value)}
            style={inputStyle()}
          />
        )}

        {field(
          "HR team email (card recipient)",
          <input
            value={form.hrEmail}
            onChange={(e) => set("hrEmail", e.target.value)}
            type="email"
            placeholder="hr-team@company.com"
            style={inputStyle()}
          />
        )}

        {field(
          "Random template",
          <SwitchToggle
            checked={form.randomTemplate}
            onChange={(v) => set("randomTemplate", v)}
            label={form.randomTemplate ? "On — a random template is picked each time" : "Off — always use the default template"}
            theme={theme}
          />
        )}

        {field(
          "Default template",
          <select
            value={form.defaultTemplate}
            onChange={(e) => set("defaultTemplate", e.target.value as CardTemplateId)}
            style={inputStyle()}
          >
            <optgroup label="Male">
              {TEMPLATES.filter((t) => t.gender === "male").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Female">
              {TEMPLATES.filter((t) => t.gender === "female").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </select>
        )}

        {field(
          "Random greeting",
          <SwitchToggle
            checked={form.randomGreeting}
            onChange={(v) => set("randomGreeting", v)}
            label={form.randomGreeting ? "On — a random greeting is picked each time" : "Off — always use the default greeting"}
            theme={theme}
          />
        )}

        {field(
          "Default greeting",
          <select
            value={currentGreetingsList.includes(form.defaultGreeting) ? form.defaultGreeting : currentGreetingsList[0]}
            onChange={(e) => set("defaultGreeting", e.target.value)}
            style={inputStyle()}
          >
            {currentGreetingsList.map((g, i) => (
              <option key={i} value={g}>
                {g.length > 70 ? `${g.slice(0, 70)}…` : g}
              </option>
            ))}
          </select>
        )}

        {field(
          "Greetings (one per line)",
          <textarea
            value={greetingsText}
            onChange={(e) => setGreetingsText(e.target.value)}
            rows={6}
            style={{
              ...inputStyle(),
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
          />
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
