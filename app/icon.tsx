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
          background: "linear-gradient(145deg, #0f1c35 0%, #1b2a4a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          gap: 0,
        }}
      >
        <span style={{ color: "#F0C040", fontSize: 11, fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1 }}>EI</span>
        <span style={{ color: "#F0C040", fontSize: 11, fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1 }}>HG</span>
      </div>
    ),
    { width: 32, height: 32 }
  );
}
