import type { CSSProperties } from "react";
import { cn } from "@/components/ui/cn";
import type { DossierDetail } from "@/lib/types";
import { SCORE_BANDS, bandFill, clampScore, labelCountsText, scoreBand, type ScoreBand, type ScoreTone } from "./model";

const FILL: Record<ScoreTone, string> = {
  accent: "bg-accent",
  mid: "bg-[color-mix(in_srgb,var(--accent)_55%,var(--fg-subtle))]",
  neutral: "bg-subtle",
};

const GAP_PX = 3;

function legendTone(b: ScoreBand, active: ScoreBand): string {
  if (b !== active) return "text-subtle";
  return b.tone === "accent" ? "font-medium text-accent-text" : "font-medium text-fg";
}

/** "0–34", "75–100" */
function bandRange(b: ScoreBand): string {
  return `${b.min}\u2013${b.max === 100 ? 100 : b.max - 1}`;
}

/**
 * Where the marker sits on a track of proportional segments separated by
 * fixed gaps: a percentage of the track minus the gaps it has passed.
 */
function markerLeft(score: number): string {
  const gaps = SCORE_BANDS.length - 1;
  const passed = SCORE_BANDS.indexOf(scoreBand(score)); // gaps to the left of the marker
  const px = passed * GAP_PX - (gaps * GAP_PX * score) / 100;
  return `calc(${score}% ${px < 0 ? "-" : "+"} ${Math.abs(px).toFixed(2)}px)`;
}

/**
 * The dossier's overall uniqueness score: the number, a scale of labeled
 * bands, and a plain count of how the details are labeled.
 */
export function ScoreScale({
  score,
  details,
  headingId = "dossier-score",
  className,
  style,
}: {
  score: number;
  details?: DossierDetail[];
  headingId?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const value = clampScore(score);
  const band = scoreBand(value);
  const counts = details ? labelCountsText(details) : null;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("rounded-lg bg-raised px-5 py-5 shadow-raise [print-color-adjust:exact] @lg/dossier:px-6", className)}
      style={style}
      data-dossier-score={value}
    >
      <div className="flex flex-col gap-5 @lg/dossier:flex-row @lg/dossier:items-center @lg/dossier:gap-10">
        <div className="shrink-0">
          <h2 id={headingId} className="text-sm text-muted">
            Uniqueness score
          </h2>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="tabular text-[2.75rem] leading-none font-semibold tracking-[-0.045em] text-fg">{value}</span>
            <span className="tabular text-sm text-subtle">/100</span>
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div
            role="meter"
            aria-labelledby={headingId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            aria-valuetext={`${value} out of 100, ${band.label}`}
            className="relative py-1.5"
          >
            <div className="flex h-1.5" style={{ gap: `${GAP_PX}px` }}>
              {SCORE_BANDS.map((b) => (
                <span
                  key={b.label}
                  className="relative min-w-0 overflow-hidden rounded-[2px] bg-line-strong"
                  style={{ flexGrow: b.max - b.min, flexBasis: 0 }}
                >
                  <span
                    className={cn("absolute inset-y-0 left-0", FILL[b.tone])}
                    style={{ width: `${(bandFill(value, b) * 100).toFixed(2)}%` }}
                  />
                </span>
              ))}
            </div>
            <span
              aria-hidden="true"
              className="absolute top-0 h-[1.125rem] w-[2px] -translate-x-1/2 rounded-full bg-fg"
              style={{ left: markerLeft(value) }}
            />
          </div>
          {/* Wide: labels under their bands. Narrow: a 2x2 key with each band's range. */}
          <ol aria-hidden="true" className="mt-1.5 hidden text-2xs leading-tight @lg/dossier:flex" style={{ gap: `${GAP_PX}px` }}>
            {SCORE_BANDS.map((b) => (
              <li key={b.label} className={cn("min-w-0 truncate", legendTone(b, band))} style={{ flexGrow: b.max - b.min, flexBasis: 0 }}>
                {b.label}
              </li>
            ))}
          </ol>
          <ol aria-hidden="true" className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-2xs @lg/dossier:hidden">
            {SCORE_BANDS.map((b) => (
              <li key={b.label} className={cn("flex justify-between gap-3", legendTone(b, band))}>
                <span>{b.label}</span>
                <span className="tabular">{bandRange(b)}</span>
              </li>
            ))}
          </ol>
          {counts ? <p className="mt-3 text-xs text-muted">{counts}</p> : null}
        </div>
      </div>
    </section>
  );
}
