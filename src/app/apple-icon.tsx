import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a1f5c",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <svg
          width="100"
          height="100"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 16l20-7-9 13-2-6-9-0z"
            fill="#e63946"
            stroke="#e63946"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
        <div
          style={{
            color: "white",
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: -0.5,
          }}
        >
          Travelyt
        </div>
      </div>
    ),
    { ...size }
  );
}
