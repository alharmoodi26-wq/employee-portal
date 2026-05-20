import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = Math.min(
    512,
    Math.max(16, parseInt(searchParams.get("size") ?? "192", 10))
  );
  const fontSize = Math.round(size * 0.33);
  const radius = Math.round(size * 0.22);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize,
            fontWeight: 900,
            letterSpacing: "-0.03em",
          }}
        >
          EIHG
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
