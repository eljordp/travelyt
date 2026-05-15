import { ImageResponse } from "next/og";

export const alt = "Travelyt — Travel light, arrive smart.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #0a1f5c 0%, #0a1f5c 60%, #1a2f7c 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Top row: logo lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg
            width="56"
            height="56"
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
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: -1.5,
            }}
          >
            Travelyt
          </div>
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div
            style={{
              color: "white",
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2.5,
              maxWidth: 900,
            }}
          >
            We move your bags. You move freely.
          </div>
          <div
            style={{
              color: "#7dd3fc",
              fontSize: 32,
              fontWeight: 500,
              fontStyle: "italic",
              letterSpacing: -0.5,
            }}
          >
            Travel light, arrive smart.
          </div>
        </div>

        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "rgba(255,255,255,0.6)",
            fontSize: 22,
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", gap: 32 }}>
            <span>Doorstep pickup</span>
            <span>·</span>
            <span>Tracked end-to-end</span>
            <span>·</span>
            <span>Fully insured</span>
          </div>
          <div style={{ color: "white", fontWeight: 700 }}>travelyt-psi.vercel.app</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
