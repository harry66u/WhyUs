import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The default social card for WhyUs (generated at build time). Uses the same
 * Instrument Sans and Newsreader files the PDF export embeds; if they cannot be
 * read, the card falls back to the built-in font rather than failing.
 */
export const alt = "WhyUs: specific, verified research for every “Why us?” essay. It never writes your essay.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONT_DIR = join(process.cwd(), "src", "lib", "pdf", "fonts");

type Weight = 400 | 600;
type FontEntry = { name: string; data: Buffer; weight: Weight; style: "normal" };

async function font(name: string, file: string, weight: Weight): Promise<FontEntry | null> {
  try {
    return { name, data: await readFile(join(FONT_DIR, file)), weight, style: "normal" };
  } catch {
    return null;
  }
}

const CANVAS = "#0a0c10";
const FG = "#e9edf3";
const MUTED = "#a0a9b7";
const SUBTLE = "#7a8392";
const LINE = "rgba(148, 163, 184, 0.18)";
const ACCENT = "#f2b33d";
const ACCENT_FG = "#1b1303";

export default async function OpengraphImage() {
  const loaded = await Promise.all([
    font("Instrument Sans", "instrumentsans/InstrumentSans-SemiBold.ttf", 600),
    font("Instrument Sans", "instrumentsans/InstrumentSans-Regular.ttf", 400),
    font("Newsreader", "newsreader/Newsreader16pt-Regular.ttf", 400),
  ]);
  const fonts = loaded.filter((f): f is FontEntry => f !== null);
  const sans = fonts.some((f) => f.name === "Instrument Sans") ? "Instrument Sans" : undefined;
  const serif = fonts.some((f) => f.name === "Newsreader") ? "Newsreader" : sans;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CANVAS,
          color: FG,
          padding: "72px 80px 64px",
          fontFamily: sans,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 18 18">
            <rect width="18" height="18" rx="5" fill={ACCENT} />
            <path d="M5.5 6h2v6h-2M12.5 6h-2v6h2" fill="none" stroke={ACCENT_FG} strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600, letterSpacing: -0.7 }}>WhyUs</div>
        </div>

        <div style={{ display: "flex", maxWidth: 980, fontSize: 74, fontWeight: 600, letterSpacing: -3, lineHeight: 1.04 }}>
          Specific, verified research for every “Why us?” essay.
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderTop: `1px solid ${LINE}`,
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", fontFamily: serif, fontSize: 30, color: MUTED }}>Official sources only. Every fact verified.</div>
          <div style={{ display: "flex", fontSize: 24, color: SUBTLE }}>It never writes your essay.</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
