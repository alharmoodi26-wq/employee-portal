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
          background: "linear-gradient(145deg, #0f1c35 0%, #1b2a4a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
          gap: 0,
        }}
      >
        <span style={{ color: "#F0C040", fontSize: 62, fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1 }}>EIHG</span>
        <span style={{ color: "#c9a520", fontSize: 18, fontWeight: 700, letterSpacing: "0.18em", lineHeight: 1, marginTop: 8 }}>PORTAL</span>
      </div>
    ),
    { width: 180, height: 180 }
  );
}
