/**
 * HTML -> readable text, preserving block boundaries so words from adjacent
 * elements never run together ("<li>A</li><li>B</li>" becomes "A\nB").
 *
 * `text` is the full visible text of the page (used for verification, so a
 * quote is found wherever it appears). `mainText` drops navigation, headers,
 * footers and sidebars (used for reading and extraction).
 */
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

export interface ExtractedLink {
  href: string;
  text: string;
}

export interface ExtractedPage {
  title: string;
  canonicalUrl: string | null;
  text: string;
  mainText: string;
  headings: string[];
  links: ExtractedLink[];
}

const SKIP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "canvas", "object", "embed", "head"]);
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "br", "caption", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
  "legend", "li", "main", "nav", "ol", "option", "p", "pre", "section", "summary", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "ul", "button", "label", "body", "html",
]);
const CHROME = new Set(["nav", "header", "footer", "aside"]);

function collect(node: AnyNode, out: string[], skipChrome: boolean): void {
  if (node.type === "text") {
    out.push((node as unknown as { data: string }).data);
    return;
  }
  if (node.type !== "tag" && node.type !== "root" && node.type !== "script" && node.type !== "style") return;
  if (node.type === "script" || node.type === "style") return;
  const el = node as Element;
  const name = el.name?.toLowerCase?.() ?? "";
  if (name && SKIP.has(name)) return;
  if (name && el.attribs && ("hidden" in el.attribs || /display\s*:\s*none/i.test(el.attribs.style ?? ""))) return;
  if (skipChrome && name && (CHROME.has(name) || el.attribs?.role === "navigation" || el.attribs?.role === "banner" || el.attribs?.role === "contentinfo")) return;
  const block = name ? BLOCK.has(name) : false;
  if (block) out.push("\n");
  if (name === "td" || name === "th") out.push(" ");
  if (name === "img" && el.attribs?.alt) out.push(` ${el.attribs.alt} `);
  for (const child of el.children ?? []) collect(child as AnyNode, out, skipChrome);
  if (block) out.push("\n");
}

function tidy(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function absolutize(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const title =
    $("title").first().text().replace(/\s+/g, " ").trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    "";
  const canonicalHref = $('link[rel="canonical"]').attr("href");
  const canonicalUrl = canonicalHref ? absolutize(canonicalHref, pageUrl) : null;

  const root = $.root()[0] as unknown as AnyNode;
  const all: string[] = [];
  collect(root, all, false);
  const text = tidy(all.join(""));

  // Main content: prefer explicit main regions, else the body without chrome.
  let mainText = "";
  const candidates = ["main", "[role=main]", "article", "#main-content", "#main", "#content", ".main-content"];
  for (const sel of candidates) {
    const el = $(sel).first()[0] as unknown as AnyNode | undefined;
    if (!el) continue;
    const parts: string[] = [];
    collect(el, parts, true);
    const t = tidy(parts.join(""));
    if (t.length > 200) {
      mainText = t;
      break;
    }
  }
  if (!mainText) {
    const body = ($("body")[0] as unknown as AnyNode | undefined) ?? root;
    const parts: string[] = [];
    collect(body, parts, true);
    mainText = tidy(parts.join(""));
  }

  const headings = $("h1, h2, h3")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean)
    .slice(0, 80);

  const seen = new Set<string>();
  const links: ExtractedLink[] = [];
  $("a[href]").each((_, el) => {
    const href = absolutize($(el).attr("href") ?? "", pageUrl);
    if (!href || seen.has(href)) return;
    seen.add(href);
    links.push({ href, text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 160) });
  });

  return { title, canonicalUrl, text, mainText, headings, links };
}

/** Plain text (or extracted PDF text) -> same shape as an HTML page. */
export function extractPlain(text: string, title = ""): ExtractedPage {
  const t = tidy(text);
  return { title, canonicalUrl: null, text: t, mainText: t, headings: [], links: [] };
}
