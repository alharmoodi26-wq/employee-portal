import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: 64,
            fontWeight: 900,
            letterSpacing: "-0.03em",
          }}
        >
          EI
        </span>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
