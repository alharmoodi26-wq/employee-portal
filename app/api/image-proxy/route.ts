import { NextResponse } from "next/server";

// Same-origin image proxy. The browser can display cross-origin images in
// <img> tags, but reading them back from a <canvas> (toDataURL/toBlob) taints
// the canvas unless the host sends CORS headers — which Firebase Storage
// buckets do not by default. By fetching the image server-side and re-serving
// it from our own origin, the canvas stays clean and PNG/PDF/email export work
// for any image source without changing bucket configuration.
//
// Restricted to Google/Firebase-owned image hosts to avoid being an open SSRF
// proxy, while covering both the classic download host and the new
// *.firebasestorage.app bucket domains.
const ALLOWED_EXACT = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "storage.cloud.google.com",
]);
const ALLOWED_SUFFIXES = [
  ".firebasestorage.app",
  ".googleapis.com",
  ".googleusercontent.com",
];

function hostAllowed(hostname: string): boolean {
  return (
    ALLOWED_EXACT.has(hostname) ||
    ALLOWED_SUFFIXES.some((s) => hostname.endsWith(s))
  );
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url." }, { status: 400 });
  }

  if (parsed.protocol !== "https:" || !hostAllowed(parsed.hostname)) {
    return NextResponse.json(
      { error: `Image host not allowed: ${parsed.hostname}` },
      { status: 403 }
    );
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      // Firebase download URLs are self-authorizing via their token.
      headers: { Accept: "image/*" },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}.` },
        { status: 502 }
      );
    }
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "The resource is not an image." },
        { status: 415 }
      );
    }
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not fetch the image." },
      { status: 502 }
    );
  }
}
