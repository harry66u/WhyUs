import { describe, expect, it } from "vitest";
import { countWords, editDistance, findNormalized, normalizeWithMap, normName, segmentDraft, sentenceAt, tokenize } from "./text";

const slices = (text: string, ranges: { start: number; end: number }[]) => ranges.map((r) => text.slice(r.start, r.end));

describe("word count", () => {
  it("counts groups of characters separated by spaces or line breaks", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords("one two\nthree")).toBe(3);
    expect(countWords("  leading and trailing  ")).toBe(3);
    // Hyphenated words and dashes without spaces stay one word, as the rule says.
    expect(countWords("a well-known lab—and more")).toBe(4);
    expect(countWords("ENGR 41, then 42.")).toBe(4);
  });
});

describe("segmentation", () => {
  it("splits paragraphs on blank lines and new lines, keeping exact ranges", () => {
    const text = "First paragraph here.\n\n  Second paragraph.\nThird line starts a paragraph.";
    const { paragraphs, sentences } = segmentDraft(text);
    expect(slices(text, paragraphs)).toEqual(["First paragraph here.", "Second paragraph.", "Third line starts a paragraph."]);
    expect(sentences.map((s) => s.paragraph)).toEqual([0, 1, 2]);
  });

  it("joins hard-wrapped lines that continue a sentence", () => {
    const text = "This sentence was wrapped\nby an email client. Then it ends.";
    const { paragraphs, sentences } = segmentDraft(text);
    expect(paragraphs).toHaveLength(1);
    expect(slices(text, sentences)).toEqual(["This sentence was wrapped\nby an email client.", "Then it ends."]);
  });

  it("does not split after abbreviations, initials, or decimals", () => {
    const text =
      "I met Dr. Rivera and Prof. Lee at the U.S. pavilion. Carl E. Example teaches ENGR 85.16. It meets at 9 a.m. on Mondays, e.g. in Room 210. Next sentence.";
    const { sentences } = segmentDraft(text);
    expect(slices(text, sentences)).toEqual([
      "I met Dr. Rivera and Prof. Lee at the U.S. pavilion.",
      "Carl E. Example teaches ENGR 85.16.",
      "It meets at 9 a.m. on Mondays, e.g. in Room 210.",
      "Next sentence.",
    ]);
  });

  it("keeps closing quotes with their sentence and splits on ? and !", () => {
    const text = "She asked, “Why rivers?” I answered quickly! Then “Wow.” Done";
    const { sentences } = segmentDraft(text);
    expect(slices(text, sentences)).toEqual(["She asked, “Why rivers?”", "I answered quickly!", "Then “Wow.”", "Done"]);
  });

  it("finds the sentence containing an offset", () => {
    const text = "One. Two three. Four.";
    const { sentences } = segmentDraft(text);
    expect(sentenceAt(sentences, text.indexOf("three"))?.index).toBe(1);
    expect(sentenceAt(sentences, 3)?.index).toBe(0);
    expect(sentenceAt(sentences, text.length + 5)).toBeUndefined();
  });

  it("handles empty input", () => {
    expect(segmentDraft("")).toEqual({ paragraphs: [], sentences: [] });
    expect(segmentDraft("\n\n  \n")).toEqual({ paragraphs: [], sentences: [] });
  });
});

describe("normalization", () => {
  it("folds case, accents, curly quotes, punctuation, and ampersands", () => {
    expect(normalizeWithMap("Café “Lab” — R&D, Inc.").text).toBe("cafe lab r and d inc");
    expect(normName("The River Sensing Lab's")).toBe("river sensing lab");
    expect(normName("ENGR 85.16")).toBe("engr 85.16");
  });

  it("maps whole-word matches back to the original text", () => {
    const text = "We visited the River  Sensing\nLab's dock, not the riverside lab.";
    const hay = normalizeWithMap(text);
    const ranges = findNormalized(hay, normName("River Sensing Lab"));
    expect(slices(text, ranges)).toEqual(["River  Sensing\nLab"]);
    expect(findNormalized(hay, "river")).toHaveLength(1); // "riverside" is not a whole-word match
  });

  it("tokenizes with offsets and marks possessives and acronyms", () => {
    const toks = tokenize("Example's DALI team");
    expect(toks.map((t) => [t.lower, t.possessive, t.acronym])).toEqual([
      ["example", true, false],
      ["dali", false, true],
      ["team", false, false],
    ]);
  });

  it("measures edit distance with a cap", () => {
    expect(editDistance("whitfield", "whitfeld")).toBe(1);
    expect(editDistance("whitfield", "whitfiled")).toBe(1);
    expect(editDistance("abc", "xyz", 1)).toBe(2);
  });
});
