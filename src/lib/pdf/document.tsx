/**
 * The dossier as a printed briefing (react-pdf). Same hierarchy as the screen:
 * masthead, school and prompt, uniqueness score, ranked details with citations,
 * swap test, essay angles, questions, and the research note.
 */
import { Circle, Document, Link, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import {
  AUDIENCE_LABELS,
  SCORE_BANDS,
  angleRefs,
  bandFill,
  clampScore,
  detailScope,
  isTopRanked,
  kindLabel,
  labelCountsText,
  orderedAngles,
  questionRef,
  rankedDetails,
  meterTone,
  scoreBand,
  statsItems,
  swapOutcome,
  uniquenessLabel,
  wordLimitText,
  type ScoreTone,
} from "@/components/dossier/model";
import { formatDate, shortUrl } from "@/lib/format";
import { RESEARCH_POLICY_NOTE, type Dossier, type DossierDetail, type SwapResult, type SwapStatus } from "@/lib/types";
import type { PdfFonts } from "./fonts";
import { COLUMN_WIDTH, MAIN_WIDTH, PDF_COLORS as C, PDF_LAYOUT as L } from "./theme";

export interface DossierPdfProps {
  dossier: Dossier;
  fonts: PdfFonts;
  preparedFor?: string | null;
}

function makeStyles(f: PdfFonts) {
  return StyleSheet.create({
    page: {
      backgroundColor: C.paper,
      color: C.ink,
      fontFamily: f.sans,
      fontSize: 9,
      paddingTop: L.marginTop,
      paddingBottom: L.marginBottom,
      paddingHorizontal: L.marginX,
    },
    column: { marginLeft: L.gutter },

    // Masthead and running chrome
    masthead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 10,
      borderBottomWidth: 0.75,
      borderBottomColor: C.line,
    },
    brand: { flexDirection: "row", alignItems: "center" },
    brandName: { fontFamily: f.sans, fontWeight: 600, fontSize: 10, color: C.ink, marginLeft: 6, letterSpacing: -0.15 },
    mastheadMeta: { fontSize: 7.5, color: C.subtle },
    runningHeader: {
      position: "absolute",
      top: 24,
      left: L.marginX,
      right: L.marginX,
    },
    runningHeaderInner: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 5,
      borderBottomWidth: 0.5,
      borderBottomColor: C.line,
      fontSize: 7,
      color: C.subtle,
    },
    footer: {
      position: "absolute",
      bottom: 28,
      left: L.marginX,
      right: L.marginX,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 6,
      borderTopWidth: 0.5,
      borderTopColor: C.line,
      fontSize: 7,
      color: C.subtle,
    },

    // Header
    school: { fontFamily: f.display, fontSize: 27, lineHeight: 1.12, color: C.ink, marginTop: 18, letterSpacing: -0.35 },
    unit: { fontSize: 10.5, color: C.muted, marginTop: 4 },
    promptLabel: { fontSize: 7.5, color: C.subtle, marginTop: 14 },
    prompt: { fontFamily: f.serif, fontSize: 11, lineHeight: 1.5, color: C.ink, marginTop: 3 },
    stats: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
    statItem: { fontSize: 7.5, color: C.subtle, marginRight: 14 },
    statValue: { color: C.muted },

    // Score
    score: {
      marginTop: 14,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 0.75,
      borderColor: C.line,
      borderRadius: 6,
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    scoreLeft: { width: 104 },
    scoreLabel: { fontSize: 7.5, color: C.muted },
    scoreNumberRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 3 },
    scoreNumber: { fontFamily: f.sans, fontWeight: 600, fontSize: 28, lineHeight: 1, color: C.ink, letterSpacing: -1 },
    scoreOutOf: { fontSize: 8, color: C.subtle, marginLeft: 3, marginBottom: 2 },
    scoreRight: { flexGrow: 1, marginLeft: 14 },
    counts: { fontSize: 7.5, color: C.muted, marginTop: 7 },

    // Sections
    sectionHead: { marginTop: 20, paddingTop: 11, borderTopWidth: 0.75, borderTopColor: C.line, marginBottom: 8 },
    sectionTitle: { fontFamily: f.sans, fontWeight: 600, fontSize: 11.5, color: C.ink, letterSpacing: -0.1 },
    sectionIntro: { fontSize: 8, lineHeight: 1.45, color: C.muted, marginTop: 3, maxWidth: 400 },

    // Details
    detail: { flexDirection: "row", paddingVertical: 9, borderTopWidth: 0.75, borderTopColor: C.line, position: "relative" },
    detailFirst: { borderTopWidth: 0, paddingTop: 4 },
    rank: {
      position: "absolute",
      left: -L.gutter,
      width: 18,
      textAlign: "right",
      fontFamily: f.sans,
      fontWeight: 500,
      fontSize: 10,
    },
    main: { width: MAIN_WIDTH },
    title: { fontFamily: f.serif, fontWeight: 500, fontSize: 13, lineHeight: 1.25, color: C.ink },
    kindRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 2.5 },
    kind: { fontSize: 7.5, color: C.muted },
    kindDivider: { width: 0.75, height: 7, backgroundColor: C.lineStrong, marginHorizontal: 6 },
    scope: { fontSize: 7.5, color: C.subtle },
    summary: { fontFamily: f.serif, fontSize: 10, lineHeight: 1.45, color: C.ink, marginTop: 6 },
    fitLabel: { fontFamily: f.sans, fontWeight: 500, fontSize: 7.5, color: C.muted, marginTop: 5 },
    fit: { fontFamily: f.serif, fontSize: 10, lineHeight: 1.45, color: C.ink, marginTop: 2 },
    quote: { marginTop: 7, paddingLeft: 7, borderLeftWidth: 1.25, borderLeftColor: C.lineStrong },
    quoteText: { fontFamily: f.serif, fontSize: 9, lineHeight: 1.45, color: C.muted },
    citation: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 4 },
    citationLink: { fontSize: 7.5, color: C.muted, textDecoration: "underline", textDecorationColor: C.lineStrong },
    verified: { flexDirection: "row", alignItems: "center", marginLeft: 8 },
    verifiedText: { fontSize: 7.5, color: C.ok, marginLeft: 2.5 },

    rail: {
      width: L.railWidth,
      marginLeft: L.railGap,
      paddingLeft: 10,
      borderLeftWidth: 0.75,
      borderLeftColor: C.line,
    },
    railLabel: { fontFamily: f.sans, fontWeight: 500, fontSize: 7.5, color: C.muted },
    railSpacer: { marginTop: 11 },
    meterRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
    meterValue: { fontSize: 7.5, color: C.muted, marginLeft: 5 },
    meterLabel: { fontFamily: f.sans, fontWeight: 500, fontSize: 7.5, marginLeft: 5 },
    commonPill: {
      alignSelf: "flex-start",
      marginTop: 4,
      paddingHorizontal: 4.5,
      paddingVertical: 1.5,
      borderWidth: 0.75,
      borderColor: C.lineStrong,
      borderRadius: 6,
    },
    commonPillText: { fontFamily: f.sans, fontWeight: 500, fontSize: 6.75, color: C.ink },
    reason: { fontSize: 7, lineHeight: 1.4, color: C.subtle, marginTop: 3.5 },
    swapItem: { flexDirection: "row", marginTop: 4.5 },
    swapGlyph: { width: 9, paddingTop: 1.5 },
    swapBody: { flexGrow: 1, flexShrink: 1, marginLeft: 3 },
    swapSchool: { fontSize: 7.5, lineHeight: 1.35, color: C.ink },
    swapStatus: { fontSize: 7, lineHeight: 1.35, color: C.muted },
    swapLink: { color: C.muted, textDecoration: "underline", textDecorationColor: C.lineStrong },

    // Angles and questions
    angle: { marginBottom: 11 },
    leadPill: {
      alignSelf: "flex-start",
      backgroundColor: C.accentWash,
      borderRadius: 7,
      paddingHorizontal: 5,
      paddingVertical: 1.75,
      marginBottom: 4,
    },
    leadPillText: { fontFamily: f.sans, fontWeight: 500, fontSize: 6.75, color: C.accentText },
    angleLead: { fontFamily: f.serif, fontSize: 12, lineHeight: 1.4, color: C.ink },
    angleLine: { fontFamily: f.serif, fontSize: 11, lineHeight: 1.4, color: C.ink },
    refs: { fontSize: 7, lineHeight: 1.4, color: C.subtle, marginTop: 3 },
    refLink: { color: C.muted, textDecoration: "underline", textDecorationColor: C.lineStrong },
    question: { paddingVertical: 8, borderTopWidth: 0.75, borderTopColor: C.line },
    questionFirst: { borderTopWidth: 0, paddingTop: 0 },
    audience: { fontSize: 7, color: C.subtle },
    questionText: { fontFamily: f.serif, fontSize: 10.5, lineHeight: 1.45, color: C.ink, marginTop: 2 },
    empty: { fontSize: 8.5, color: C.subtle },

    // Research note
    note: { marginTop: 20, backgroundColor: C.sunken, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12 },
    noteTitle: { fontFamily: f.sans, fontWeight: 600, fontSize: 8.5, color: C.ink },
    noteText: { fontSize: 8, lineHeight: 1.5, color: C.muted, marginTop: 3 },
  });
}

type Styles = ReturnType<typeof makeStyles>;

const METER_FILL: Record<ScoreTone, string> = { accent: C.accent, mid: C.meterMid, neutral: C.meterNeutral };

/* ------------------------------------------------------------------ */
/* Small marks                                                         */
/* ------------------------------------------------------------------ */

function LogoMark({ size = 12 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Rect x={0} y={0} width={18} height={18} rx={5} ry={5} fill={C.accent} />
      <Path d="M5.5 6h2v6h-2M12.5 6h-2v6h2" stroke={C.accentFg} strokeWidth={1.4} strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function CheckMark() {
  return (
    <Svg width={7} height={7} viewBox="0 0 16 16">
      <Path d="M3.5 8.5l3 3 6-7" stroke={C.ok} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

const SWAP_COLOR: Record<SwapStatus, string> = { equivalent: C.muted, similar: C.muted, none: C.ok, unknown: C.subtle };

function SwapMark({ status }: { status: SwapStatus }) {
  const color = SWAP_COLOR[status];
  return (
    <Svg width={7} height={7} viewBox="0 0 12 12">
      {status === "equivalent" ? <Circle cx={6} cy={6} r={4.25} fill={color} stroke={color} strokeWidth={1.25} /> : null}
      {status === "similar" ? <Circle cx={6} cy={6} r={4.25} fill="none" stroke={color} strokeWidth={1.25} /> : null}
      {status === "similar" ? <Path d="M6 1.75a4.25 4.25 0 0 1 0 8.5z" fill={color} /> : null}
      {status === "none" ? <Circle cx={6} cy={6} r={4.25} fill="none" stroke={color} strokeWidth={1.25} /> : null}
      {status === "unknown" ? (
        <Circle cx={6} cy={6} r={4.25} fill="none" stroke={color} strokeWidth={1.25} strokeDasharray="1.7 1.6" />
      ) : null}
    </Svg>
  );
}

/** Five-segment meter, same thresholds as the on-screen UniquenessMeter. */
function Meter({ score }: { score: number }) {
  const value = clampScore(score);
  const filled = Math.round((value / 100) * 5);
  const fill = METER_FILL[meterTone(value)];
  return (
    <Svg width={5 * 8 + 4 * 1.75} height={4} viewBox={`0 0 ${5 * 8 + 4 * 1.75} 4`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Rect key={i} x={i * 9.75} y={0} width={8} height={4} rx={1} ry={1} fill={i < filled ? fill : C.meterEmpty} />
      ))}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Score scale                                                         */
/* ------------------------------------------------------------------ */

const TRACK_GAP = 2;

function ScoreTrack({ score, width, s }: { score: number; width: number; s: Styles }) {
  const value = clampScore(score);
  const band = scoreBand(value);
  const usable = width - TRACK_GAP * (SCORE_BANDS.length - 1);
  const widths = SCORE_BANDS.map((b) => ((b.max - b.min) / 100) * usable);
  const index = SCORE_BANDS.indexOf(band);
  const markerX = (value / 100) * usable + index * TRACK_GAP;
  const segments = SCORE_BANDS.map((b, i) => ({
    x: widths.slice(0, i).reduce((sum, w) => sum + w + TRACK_GAP, 0),
    w: widths[i],
    fill: bandFill(value, b),
    color: METER_FILL[b.tone],
  }));
  return (
    <View>
      <Svg width={width} height={12} viewBox={`0 0 ${width} 12`}>
        {segments.map((seg, i) => (
          <Rect key={`bg-${i}`} x={seg.x} y={4} width={seg.w} height={4.5} rx={1.25} ry={1.25} fill={C.meterEmpty} />
        ))}
        {segments.map((seg, i) =>
          seg.fill > 0 ? (
            <Rect key={`fg-${i}`} x={seg.x} y={4} width={Math.max(1.5, seg.w * seg.fill)} height={4.5} rx={1.25} ry={1.25} fill={seg.color} />
          ) : null,
        )}
        <Rect x={Math.min(width - 1.5, Math.max(0, markerX - 0.75))} y={0} width={1.5} height={12} rx={0.75} ry={0.75} fill={C.ink} />
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 3 }}>
        {SCORE_BANDS.map((b, i) => (
          <Text
            key={b.label}
            style={{
              width: widths[i] + (i < SCORE_BANDS.length - 1 ? TRACK_GAP : 0),
              fontSize: 6.75,
              fontFamily: s.sectionTitle.fontFamily,
              fontWeight: b === band ? 500 : 400,
              color: b === band ? (b.tone === "accent" ? C.accentText : C.ink) : C.subtle,
            }}
          >
            {b.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function SectionHead({ title, intro, s }: { title: string; intro?: string; s: Styles }) {
  return (
    <View style={s.sectionHead} minPresenceAhead={64} wrap={false}>
      <Text style={s.sectionTitle}>{title}</Text>
      {intro ? <Text style={s.sectionIntro}>{intro}</Text> : null}
    </View>
  );
}

function SwapLine({ result, s }: { result: SwapResult; s: Styles }) {
  const { status, title } = swapOutcome(result);
  return (
    <View style={s.swapItem}>
      <View style={s.swapGlyph}>
        <SwapMark status={result.status} />
      </View>
      <View style={s.swapBody}>
        <Text style={s.swapSchool}>{result.schoolName}</Text>
        <Text style={s.swapStatus}>
          {status}
          {title ? " " : ""}
          {title ? (
            result.equivalentUrl ? (
              <Link src={result.equivalentUrl} style={s.swapLink}>
                {title}
              </Link>
            ) : (
              title
            )
          ) : null}
        </Text>
      </View>
    </View>
  );
}

/**
 * The PDF keeps a short verbatim excerpt so each entry stays compact; the
 * citation links to the official page where the full passage was confirmed.
 */
export function quoteExcerpt(quote: string, max = 190): string {
  const q = quote.replace(/\s+/g, " ").trim();
  if (q.length <= max) return q;
  const cut = q.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-]+$/, "")}…`;
}

function DetailBlock({
  detail,
  dossier,
  first,
  showSwap,
  s,
}: {
  detail: DossierDetail;
  dossier: Dossier;
  first: boolean;
  showSwap: boolean;
  s: Styles;
}) {
  const scope = detailScope(detail, dossier);
  const label = uniquenessLabel(detail);
  const score = clampScore(detail.uniqueness.score);
  const verified = formatDate(detail.verifiedAt);
  return (
    <View id={`detail-${detail.rank}`} style={first ? [s.detail, s.detailFirst] : s.detail} wrap={false}>
      <Text style={[s.rank, { top: first ? 5.5 : 14.5, color: isTopRanked(detail) ? C.accentText : C.subtle }]}>{detail.rank}</Text>
      <View style={s.main}>
        <Text style={s.title}>{detail.title}</Text>
        <View style={s.kindRow}>
          <Text style={s.kind}>{kindLabel(detail.kind)}</Text>
          {scope ? <View style={s.kindDivider} /> : null}
          {scope ? <Text style={s.scope}>{scope}</Text> : null}
        </View>
        <Text style={s.fitLabel}>Why it fits you</Text>
        <Text style={s.fit}>{detail.fit.sentence}</Text>
        <View style={s.quote}>
          <Text style={s.quoteText}>{`“${quoteExcerpt(detail.quote)}”`}</Text>
          <View style={s.citation}>
            <Text>
              <Link src={detail.sourceUrl} style={s.citationLink}>
                {shortUrl(detail.sourceUrl, 72)}
              </Link>
            </Text>
            {verified ? (
              <View style={s.verified}>
                <CheckMark />
                <Text style={s.verifiedText}>Verified {verified}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <View style={s.rail}>
        <Text style={s.railLabel}>Uniqueness</Text>
        <View style={s.meterRow}>
          <Meter score={score} />
          <Text style={s.meterValue}>{score}</Text>
          {label === "Commonly mentioned" ? null : (
            <Text style={[s.meterLabel, { color: label === "Distinctive" ? C.accentText : C.ink }]}>{label}</Text>
          )}
        </View>
        {label === "Commonly mentioned" ? (
          <View style={s.commonPill}>
            <Text style={s.commonPillText}>Commonly mentioned</Text>
          </View>
        ) : null}
        {showSwap ? (
          <View style={s.railSpacer}>
            <Text style={s.railLabel}>Swap test</Text>
            {detail.swap.length > 0 ? (
              detail.swap.map((r) => <SwapLine key={r.schoolId} result={r} s={s} />)
            ) : (
              <Text style={[s.swapStatus, { marginTop: 4 }]}>No other schools on the list to compare yet.</Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Stat({ children, s }: { children: ReactNode; s: Styles }) {
  return <Text style={s.statItem}>{children}</Text>;
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

export function DossierPdfDocument({ dossier, fonts, preparedFor }: DossierPdfProps) {
  const s = makeStyles(fonts);
  const details = rankedDetails(dossier);
  const angles = orderedAngles(dossier.angles ?? []);
  const questions = dossier.questions ?? [];
  const value = clampScore(dossier.uniquenessScore);
  const counts = labelCountsText(details);
  const generated = formatDate(dossier.generatedAt);
  const stats = statsItems(dossier.stats);
  const comparedSchools = details.some((d) => (d.swap?.length ?? 0) > 0);
  const place = dossier.unitName && dossier.unitName !== dossier.schoolName ? `${dossier.schoolName}, ${dossier.unitName}` : dossier.schoolName;
  const trackWidth = COLUMN_WIDTH - 28 - 104 - 14;

  return (
    <Document
      title={`${dossier.schoolName} dossier`}
      author="WhyUs"
      subject={`Research briefing for the ${dossier.schoolName} supplemental essay`}
      keywords={["WhyUs", "dossier", dossier.schoolName, dossier.unitName ?? ""].filter(Boolean).join(", ")}
      creator="WhyUs"
      producer="WhyUs"
      language="en-US"
    >
      <Page size="LETTER" style={s.page} wrap>
        <View
          fixed
          style={s.runningHeader}
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={s.runningHeaderInner}>
                <Text>{place}</Text>
                <Text>WhyUs dossier</Text>
              </View>
            ) : null
          }
        />
        <View fixed style={s.footer}>
          <Text>Research only. WhyUs never writes the essay.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        {/* Masthead */}
        <View style={s.masthead}>
          <View style={s.brand}>
            <LogoMark />
            <Text style={s.brandName}>WhyUs</Text>
          </View>
          <Text style={s.mastheadMeta}>{preparedFor ? `Research dossier prepared for ${preparedFor}` : "Research dossier"}</Text>
        </View>

        <View style={s.column}>
          {/* Header */}
          <Text style={s.school}>{dossier.schoolName}</Text>
          {dossier.unitName && dossier.unitName !== dossier.schoolName ? <Text style={s.unit}>{dossier.unitName}</Text> : null}
          <Text style={s.promptLabel}>The prompt, {wordLimitText(dossier.prompt.wordLimit)}</Text>
          <Text style={s.prompt}>{`“${dossier.prompt.text}”`}</Text>
          <View style={s.stats}>
            {generated ? (
              <Stat s={s}>
                Generated <Text style={s.statValue}>{generated}</Text>
              </Stat>
            ) : null}
            {stats.map((item) => (
              <Stat key={item} s={s}>
                {item}
              </Stat>
            ))}
          </View>

          {/* Uniqueness score */}
          <View style={s.score} wrap={false}>
            <View style={s.scoreLeft}>
              <Text style={s.scoreLabel}>Uniqueness score</Text>
              <View style={s.scoreNumberRow}>
                <Text style={s.scoreNumber}>{value}</Text>
                <Text style={s.scoreOutOf}>/100</Text>
              </View>
            </View>
            <View style={s.scoreRight}>
              <ScoreTrack score={value} width={trackWidth} s={s} />
              {counts ? <Text style={s.counts}>{counts}</Text> : null}
            </View>
          </View>

          {/* Ranked details */}
          <SectionHead
            title="Ranked details"
            intro={
              comparedSchools
                ? "Ranked by how directly each detail connects to your activities. Each was confirmed on the official page cited, and the swap test checks whether your other schools have the same thing."
                : "Ranked by how directly each detail connects to your activities. Each was confirmed on the official page cited."
            }
            s={s}
          />
          {details.length > 0 ? (
            details.map((d, i) => <DetailBlock key={d.factId} detail={d} dossier={dossier} first={i === 0} showSwap={comparedSchools} s={s} />)
          ) : (
            <Text style={s.empty}>No details passed verification for this school.</Text>
          )}

          {/* Essay angles */}
          <SectionHead
            title="Essay angles"
            intro="Possible directions, one line each. They are ideas to test against your own experience, not text for your essay."
            s={s}
          />
          {angles.length > 0 ? (
            angles.map((a) => {
              const refs = angleRefs(a, details);
              return (
                <View key={a.key} style={s.angle} wrap={false}>
                  {a.isLead ? (
                    <View style={s.leadPill}>
                      <Text style={s.leadPillText}>Lead angle</Text>
                    </View>
                  ) : null}
                  <Text style={a.isLead ? s.angleLead : s.angleLine}>{a.line}</Text>
                  {refs.length > 0 ? (
                    <Text style={s.refs}>
                      Draws on{" "}
                      {refs.map((r, i) => (
                        <Text key={r.rank}>
                          <Link src={`#detail-${r.rank}`} style={s.refLink}>
                            {r.title}
                          </Link>
                          {i < refs.length - 1 ? ", " : ""}
                        </Text>
                      ))}
                    </Text>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text style={s.empty}>No angles were proposed for this school.</Text>
          )}

          {/* Questions */}
          <SectionHead title="Questions to ask" intro="Specific questions for an info session or a current student." s={s} />
          {questions.length > 0 ? (
            questions.map((q, i) => {
              const ref = questionRef(q, details);
              return (
                <View key={`${i}-${q.text.slice(0, 16)}`} style={i === 0 ? [s.question, s.questionFirst] : s.question} wrap={false}>
                  <Text style={s.audience}>{AUDIENCE_LABELS[q.audience] ?? "Ask"}</Text>
                  <Text style={s.questionText}>{q.text}</Text>
                  {ref ? (
                    <Text style={s.refs}>
                      About{" "}
                      <Link src={`#detail-${ref.rank}`} style={s.refLink}>
                        {ref.title}
                      </Link>
                    </Text>
                  ) : null}
                </View>
              );
            })
          ) : (
            <Text style={s.empty}>No questions were proposed for this school.</Text>
          )}

          {/* Research note */}
          <View style={s.note} minPresenceAhead={24}>
            <Text style={s.noteTitle}>Research note</Text>
            <Text style={s.noteText}>{dossier.policyNote?.trim() || RESEARCH_POLICY_NOTE}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
