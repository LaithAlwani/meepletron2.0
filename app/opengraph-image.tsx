import { ImageResponse } from "next/og";

// Default social card, inherited by every route that doesn't set its own image.
export const alt =
  "Meepletron — AI board game rules, answered from the rulebook";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #191512 0%, #221d18 60%, #2a2018 100%)",
          color: "#f6f0e8",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "#ff7a4d",
          }}
        >
          🎲 Meepletron
        </div>
        <div
          style={{
            marginTop: "28px",
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            maxWidth: "960px",
            letterSpacing: "-0.02em",
          }}
        >
          Ask any board game rule — answered from the rulebook.
        </div>
        <div
          style={{
            marginTop: "28px",
            fontSize: 32,
            lineHeight: 1.3,
            maxWidth: "900px",
            color: "#c9bfb2",
          }}
        >
          An AI rules expert that quotes the exact rule, with the page it came
          from — not a guess from a general AI.
        </div>
      </div>
    ),
    { ...size },
  );
}
