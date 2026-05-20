import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "-0.02em",
          }}
        >
          EI
        </span>
      </div>
    ),
    { width: 32, height: 32 }
  );
}
