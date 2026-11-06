import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import sampleStudentJson from "@data/sample-student.json";
import MarketingLayout from "@/app/(marketing)/layout";
import LandingPage, { metadata } from "@/app/(marketing)/page";
import { SwapGlyph } from "@/components/dossier";
import { formatDate } from "@/lib/format";
import { listSchools, schoolForUrl } from "@/lib/schools/registry";
import type { StudentProfile, SwapStatus } from "@/lib/types";
import { exampleLandingDemo, getLandingDemo } from "./demo-data";
import { Hero } from "./hero";
import { formatPrice, landingPrices } from "./prices";
import { ResearchDemo } from "./research-demo";
import { excerpt, matrixRows } from "./specimens";
import { DemoSwapGlyph } from "./swap-glyph";

/** Visible text: tags removed, common entities decoded, whitespace collapsed. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

async function renderPage(): Promise<string> {
  const page = await LandingPage();
  return renderToStaticMarkup(createElement(MarketingLayout, null, page));
}

describe("landing page", () => {
  it("states the job, the promise, and the next step", async () => {
    const html = await renderPage();
    const t = text(html);
    expect(t).toContain("Specific, verified research for every “Why us?” essay.");
    expect(t).toContain("never writes a word of your essay");
    expect(t).toContain("WhyUs never writes or rewrites your essay.");
    expect(html).toMatch(/<h1[^>]*>Specific, verified research/);
    // Exactly one h1, and the primary call to action goes to sign-in.
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]+href="\/login"[^>]*>Build your first dossier, free<\/a>/);
    expect(html).toMatch(/href="#how-it-works"/);
    expect(html).toMatch(/id="how-it-works"/);
    expect(html).toMatch(/href="\/pricing"/);
    expect(html).toMatch(/href="\/privacy"/);
    expect(html).toMatch(/<main id="main"/);
  });

  it("shows a real citation with its verification date and checks", async () => {
    const demo = await getLandingDemo();
    const t = text(await renderPage());
    expect(t).toContain(demo.citation.title);
    expect(t).toContain(`Verified ${formatDate(demo.citation.verifiedAt)}`);
    expect(t).toContain("The quoted text is on the page, word for word");
    if (demo.citation.nameOnPage) expect(t).toContain(demo.citation.nameOnPage);
  });

  it("shows the swap test as a matrix of details by schools", async () => {
    const demo = await getLandingDemo();
    const html = await renderPage();
    expect(html).toContain("<table");
    for (const s of demo.compared) expect(html).toContain(`>${s.shortName}</th>`);
    for (const d of matrixRows(demo.dossier.details)) expect(text(html)).toContain(d.title);
    for (const label of ["Equivalent", "Similar", "No equivalent found", "Not researched yet"]) expect(text(html)).toContain(label);
  });

  it("numbers the four steps as a sequence", async () => {
    const html = await renderPage();
    const section = html.slice(html.indexOf('id="how-it-works"'));
    const steps = section.slice(0, section.indexOf("</ol>")).match(/<li\b/g) ?? [];
    expect(steps).toHaveLength(4);
    for (const title of ["Build your profile", "Add schools and prompts", "Watch the research", "Use your dossier"]) expect(section).toContain(title);
  });

  it("links only to official school pages outside the site", async () => {
    const html = await renderPage();
    const external = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    expect(external.length).toBeGreaterThan(0);
    for (const url of external) expect(schoolForUrl(url), url).toBeDefined();
  });

  it("avoids the generic tells the design system rules out", async () => {
    const html = await renderPage();
    const t = text(html);
    expect(t).not.toMatch(/\p{Emoji_Presentation}/u);
    expect(t).not.toContain("→");
    expect(t).not.toContain(" · ");
    // Hype words, outside the draft specimen's deliberately generic sentence and its note.
    const ownWords = t.replace(/I am drawn to[^.]*\./, "").replace(/“World-class faculty”[^.]*\./, "");
    expect(ownWords).not.toMatch(/\b(world-class|unlock|supercharge|revolutionary|cutting-edge)\b/i);
    // No decorative gradients (the console's edge fade is a mask, not a color wash).
    expect(html).not.toMatch(/bg-gradient|bg-linear-|bg-radial-|\bfrom-[a-z]+-\d+/);
  });

  it("starts the replay on the first stage, with the dossier slots reserved", async () => {
    const demo = await getLandingDemo();
    const html = renderToStaticMarkup(createElement(ResearchDemo, { demo }));
    const t = text(html);
    expect(t).toContain("Scope the prompt");
    expect(t).toContain("Replaying");
    expect(t).toContain("Pause");
    expect(html.match(/data-demo-detail="/g)).toHaveLength(demo.dossier.details.length);
    expect(html).toContain('aria-live="polite"');
    // No detail row is filled in before its match arrives.
    for (const d of demo.dossier.details) expect(html).not.toContain(`href="${d.sourceUrl.replace(/&/g, "&amp;")}"`);
    expect(t).not.toContain("Final ranking");
  });

  it("labels the example data when no research base is available", () => {
    const student = sampleStudentJson as unknown as StudentProfile;
    const html = renderToStaticMarkup(createElement(Hero, { demo: exampleLandingDemo(student) }));
    const t = text(html);
    expect(t).toContain("Example");
    expect(t).toContain("fictional");
    for (const school of listSchools()) expect(t).not.toContain(school.name);
  });

  it("has a title, description, and social card settings", () => {
    const title = metadata.title as { absolute: string };
    expect(title.absolute).toMatch(/^WhyUs: /);
    expect(metadata.description).toMatch(/never writes your essay/);
    expect(metadata.openGraph).toMatchObject({ type: "website", url: "/" });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("landing pieces", () => {
  it("draws swap glyphs exactly like the dossier briefing", () => {
    for (const status of ["equivalent", "similar", "none", "unknown"] as SwapStatus[]) {
      const ours = renderToStaticMarkup(createElement(DemoSwapGlyph, { status }));
      const theirs = renderToStaticMarkup(createElement(SwapGlyph, { status }));
      expect(ours).toBe(theirs);
    }
  });

  it("shortens long quotes at a word with an ellipsis", () => {
    expect(excerpt("Short quote.")).toBe("Short quote.");
    const long = "word ".repeat(120).trim();
    const out = excerpt(long, 60);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out).not.toMatch(/\s…$/);
  });

  it("keeps the most swappable detail in the matrix for contrast", () => {
    const base = { kind: "course" as const, summary: "", quote: "", sourceUrl: "", sourceTitle: "", verifiedAt: "2026-11-05", fit: { sentence: "", activityIds: [], themes: [], score: 0.5 } };
    const detail = (rank: number, equivalents: number) => ({
      ...base,
      factId: `f${rank}`,
      rank,
      title: `Detail ${rank}`,
      uniqueness: { score: 80 - equivalents * 10, label: "Uncommon" as const, commonlyMentioned: false, reason: "" },
      swap: Array.from({ length: 3 }, (_, i) => ({ schoolId: `s${i}`, schoolName: `S${i}`, status: (i < equivalents ? "equivalent" : "none") as SwapStatus })),
    });
    const rows = matrixRows([detail(1, 0), detail(2, 0), detail(3, 0), detail(4, 0), detail(5, 0), detail(6, 3), detail(7, 1)]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 6]);
  });

  it("reads prices from the billing environment with the documented defaults", () => {
    expect(landingPrices({})).toEqual({ perSchool: "$9", unlimited: "$29" });
    expect(landingPrices({ PRICE_SCHOOL_CENTS: "1250", PRICE_UNLIMITED_CENTS: "3900" })).toEqual({ perSchool: "$12.50", unlimited: "$39" });
    expect(landingPrices({ PRICE_SCHOOL_CENTS: "abc", PRICE_UNLIMITED_CENTS: "-5" })).toEqual({ perSchool: "$9", unlimited: "$29" });
    expect(formatPrice(900)).toBe("$9");
  });
});
