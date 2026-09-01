import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_HOST } from "@/lib/site";

export const alt = "Travelyt — Your bags leave home. You arrive lighter.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
const logoData = await readFile(join(process.cwd(), "public/logo-white.png"), "base64");
const logoSrc = `data:image/png;base64,${logoData}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #081546 0%, #081546 60%, #1a2f7c 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Top row: logo lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* The social preview uses the same approved logo as the website. */}
          <img src={logoSrc} width={150} height={102} alt="Travelyt" />
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
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2.5,
              maxWidth: 900,
            }}
          >
            Your bags leave home. You arrive lighter.
          </div>
          <div
            style={{
              color: "#ff6868",
              fontSize: 32,
              fontWeight: 500,
              fontStyle: "italic",
              letterSpacing: -0.5,
            }}
          >
            One pickup. Two paths. Travel lighter.
          </div>
        </div>

        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "rgba(255,255,255,0.6)",
            fontSize: 20,
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", gap: 32 }}>
            <span>Doorstep pickup</span>
            <span>·</span>
            <span>Recorded custody</span>
            <span>·</span>
            <span>Preparing for launch</span>
          </div>
          <div style={{ color: "white", fontWeight: 700 }}>{SITE_HOST}</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
