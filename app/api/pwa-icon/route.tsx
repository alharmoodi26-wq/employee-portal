import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = Math.min(
    512,
    Math.max(16, parseInt(searchParams.get("size") ?? "192", 10))
  );
  const fontSize = Math.round(size * 0.28);
  const subFontSize = Math.round(size * 0.085);
  const radius = Math.round(size * 0.22);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: "linear-gradient(145deg, #0f1c35 0%, #1b2a4a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius,
          gap: 0,
        }}
      >
        <span style={{ color: "#F0C040", fontSize, fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1 }}>EIHG</span>
        <span style={{ color: "#c9a520", fontSize: subFontSize, fontWeight: 700, letterSpacing: "0.18em", lineHeight: 1, marginTop: Math.round(size * 0.04) }}>PORTAL</span>
      </div>
    ),
    { width: size, height: size }
  );
}
