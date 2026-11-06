import { describe, expect, it } from "vitest";
import type { ResearchEvent } from "@/lib/types";
import { candidateToFact, crawlSchool, pageProblem, parseSitemap, scoreUrl, selectUrls, type ExtractedFact, type Extractor } from "./crawler";
import { createStageTracker } from "./events";
import { EXAMPLE_SCHOOL, STUDENT, StubPageSource } from "./testing/example-school";

const unit = EXAMPLE_SCHOOL.units[0];
const studentThemes = new Set(["water", "sensors", "jazz"]);

describe("page discovery", () => {
  it("parses sitemaps and sitemap indexes", () => {
    expect(parseSitemap(`<?xml version="1.0"?><urlset><url><loc>https://www.example.edu/a</loc></url><url><loc> https://www.example.edu/b?x=1&amp;y=2 </loc></url></urlset>`)).toEqual({
      urls: ["https://www.example.edu/a", "https://www.example.edu/b?x=1&y=2"],
      sitemaps: [],
    });
    expect(parseSitemap(`<sitemapindex><sitemap><loc>https://www.example.edu/sitemap-1.xml</loc></sitemap></sitemapindex>`)).toEqual({
      urls: [],
      sitemaps: ["https://www.example.edu/sitemap-1.xml"],
    });
  });

  it("scores pages likely to hold citable details and skips news, events, and off-site links", () => {
    const opts = { school: EXAMPLE_SCHOOL, unit, studentThemes };
    expect(scoreUrl("https://www.example.edu/news/2026/05/lab-opens", opts)).toBeNull();
    expect(scoreUrl("https://www.example.edu/events/river-day", opts)).toBeNull();
    expect(scoreUrl("https://elsewhere.example.com/labs/water", opts)).toBeNull();
    expect(scoreUrl("https://www.example.edu/", opts)).toBeNull();
    const lab = scoreUrl("https://engineering.example.edu/research/labs/water-sensing", opts);
    const generic = scoreUrl("https://www.example.edu/academics/overview", opts);
    expect(lab?.bucket).toBe("research");
    expect(lab!.score).toBeGreaterThan(generic!.score);
  });

  it("caps each kind of page so the crawl covers different details", () => {
    const scored = [
      ...Array.from({ length: 12 }, (_, i) => ({ url: `https://catalog.example.edu/courses/${i}`, score: 10, bucket: "catalog" as const })),
      { url: "https://www.example.edu/clubs/jazz", score: 4, bucket: "organizations" as const },
      { url: "https://engineering.example.edu/labs/river", score: 5, bucket: "research" as const },
    ];
    const picked = selectUrls(scored, 8);
    expect(picked).toHaveLength(8);
    expect(picked).toContain("https://www.example.edu/clubs/jazz");
    expect(picked).toContain("https://engineering.example.edu/labs/river");
  });

  it("phrases unreadable pages so they follow the host name", () => {
    const base = { url: "https://lsa.example.edu/x", finalUrl: "https://lsa.example.edu/x", host: "lsa.example.edu", ok: false, title: "", text: "", mainText: "", links: [], headings: [], contentHash: null, fetchedAt: new Date().toISOString(), ms: 0, fromCache: false };
    expect(pageProblem({ ...base, status: 403, blockedReason: "bot-challenge" })).toBe("answered with a bot challenge; skipped");
    expect(pageProblem({ ...base, status: 404 })).toBe("no longer has this page (HTTP 404)");
    expect(pageProblem({ ...base, status: 0, problem: "Timed out" })).toBe("did not respond in time");
  });
});

describe("crawl for a school without a research base", () => {
  const labUrl = "https://engineering.example.edu/research/labs/water-sensing";
  const clubUrl = "https://www.example.edu/student-life/clubs/jazz-combo";
  const labText =
    "Water Sensing Lab\nUndergraduates in the Water Sensing Lab build sensors that measure river turbidity and temperature.\nThe lab meets weekly during the academic year.\n" +
    "x".repeat(400);
  const clubText = "Jazz Combo\nThe Jazz Combo rehearses on Tuesday evenings and performs student arrangements each term.\n" + "y".repeat(400);
  const pages = {
    "https://engineering.example.edu/research": { text: "Research at Example Engineering", links: [{ href: labUrl, text: "Water Sensing Lab" }] },
    "https://www.example.edu/student-life/clubs": { text: "Clubs", links: [{ href: clubUrl, text: "Jazz Combo" }, { href: "https://www.example.edu/news/2026/club-fair", text: "News" }] },
    "https://engineering.example.edu/": { text: "Example Engineering" },
    [labUrl]: { text: labText, title: "Water Sensing Lab | Example Engineering" },
    [clubUrl]: { text: clubText, title: "Jazz Combo | Example University" },
  };

  const candidate = (over: Partial<ExtractedFact>): ExtractedFact => ({
    kind: "lab",
    title: "Water Sensing Lab",
    nameOnPage: "Water Sensing Lab",
    summary: "A lab where undergraduates build river sensors.",
    hook: "lets undergraduates build sensors for river monitoring",
    quote: "Undergraduates in the Water Sensing Lab build sensors that measure river turbidity and temperature.",
    themes: ["water", "sensors"],
    commonness: "rare",
    commonnessReason: "",
    people: [],
    unitIds: ["engineering", "not-a-unit"],
    ...over,
  });

  const extract: Extractor = async (page) => {
    if (page.url === labUrl) {
      return [candidate({}), candidate({ title: "Invented Lab", nameOnPage: "Invented Lab", quote: "The Invented Lab does something that this page never says at all." })];
    }
    if (page.url === clubUrl) {
      return [
        candidate({
          kind: "organization",
          title: "Jazz Combo",
          nameOnPage: "Jazz Combo",
          summary: "A student jazz group that performs student arrangements.",
          hook: "lets students rehearse and perform jazz arrangements",
          quote: "The Jazz Combo rehearses on Tuesday evenings and performs student arrangements each term.",
          themes: ["jazz"],
          unitIds: [],
        }),
      ];
    }
    return [];
  };

  it("discovers official pages, extracts candidates, and keeps only quotes found on the page", async () => {
    const events: ResearchEvent[] = [];
    const emit = async (e: ResearchEvent) => {
      events.push(e);
    };
    const stages = createStageTracker(emit);
    await stages.start("discover");
    const source = new StubPageSource(pages, 1);
    const result = await crawlSchool({
      school: EXAMPLE_SCHOOL,
      unit,
      student: STUDENT,
      pageSource: source,
      emit,
      stages,
      extract,
      sitemapUrls: async () => [],
      budgetMs: 5_000,
    });

    expect(result.facts.map((f) => f.title).sort()).toEqual(["Jazz Combo", "Water Sensing Lab"]);
    const lab = result.facts.find((f) => f.title === "Water Sensing Lab")!;
    expect(lab.sourceUrl).toBe(labUrl);
    expect(lab.unitIds).toEqual(["engineering"]); // unknown units dropped
    expect(lab.verification?.status).toBe("verified");
    expect(lab.verifiedAt).toBe(new Date().toISOString().slice(0, 10));
    expect(lab.id).toMatch(/^example:water-sensing-lab:[0-9a-f]{6}$/);
    expect(result.factsRejected).toBe(1);
    const rejected = events.find((e) => e.type === "fact" && e.status === "rejected");
    expect(rejected).toMatchObject({ title: "Invented Lab", reason: "the quoted text is not on the page" });
    // The news link was never read.
    expect(source.loads.has("https://www.example.edu/news/2026/club-fair")).toBe(false);
    const stageOrder = events.filter((e) => e.type === "stage").map((e) => `${(e as { stage: string }).stage}:${(e as { status: string }).status}`);
    expect(stageOrder).toEqual(["discover:start", "discover:done", "read:start", "verify:start", "read:done", "verify:done"]);
  });

  it("builds stable fact ids from the page it was confirmed on", () => {
    const page = { url: labUrl, finalUrl: `${labUrl}#top`, host: "engineering.example.edu", status: 200, ok: true, title: "Water Sensing Lab", text: labText, mainText: labText, links: [], headings: [], contentHash: null, fetchedAt: new Date().toISOString(), ms: 1, fromCache: false };
    const a = candidateToFact(candidate({}), page, EXAMPLE_SCHOOL);
    const b = candidateToFact(candidate({}), page, EXAMPLE_SCHOOL);
    expect(a.id).toBe(b.id);
    expect(a.sourceUrl).toBe(labUrl);
    expect(a.themes).toEqual(expect.arrayContaining(["water", "sensors"]));
  });
});
