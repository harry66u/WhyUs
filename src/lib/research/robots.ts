/**
 * robots.txt support (RFC 9309).
 *
 * - Groups are selected by the most specific matching user-agent product token,
 *   falling back to "*".
 * - Within the selected rules, the longest matching path wins; on a tie, Allow wins.
 * - "*" wildcards and "$" end anchors are supported.
 * - Crawl-delay (non-standard) is honored when present, capped at 10 seconds.
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  crawlDelayMs: number | null;
  sitemaps: string[];
}

interface Group {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay: number | null;
}

export function parseRobots(text: string, productToken: string): RobotsPolicy {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      if (key === "disallow" && value === "") continue; // empty disallow = allow all
      current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "crawl-delay") {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }

  const token = productToken.toLowerCase();
  let best: Group[] = [];
  let bestLen = -1;
  for (const g of groups) {
    for (const agent of g.agents) {
      if (agent !== "*" && token.includes(agent) && agent.length > bestLen) {
        best = [g];
        bestLen = agent.length;
      } else if (agent !== "*" && token.includes(agent) && agent.length === bestLen) {
        best.push(g);
      }
    }
  }
  if (best.length === 0) best = groups.filter((g) => g.agents.includes("*"));

  const rules = best.flatMap((g) => g.rules);
  const delays = best.map((g) => g.crawlDelay).filter((d): d is number => d !== null);
  const crawlDelayMs = delays.length ? Math.min(Math.max(...delays), 10) * 1000 : null;
  return { rules, crawlDelayMs, sitemaps };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

/** Returns true when `pathWithQuery` may be fetched under `policy`. */
export function isAllowed(policy: RobotsPolicy, pathWithQuery: string): boolean {
  if (pathWithQuery === "/robots.txt") return true;
  let decision: { allow: boolean; length: number } | null = null;
  for (const rule of policy.rules) {
    if (!rule.pattern) continue;
    let target = pathWithQuery;
    try {
      target = decodeURIComponent(pathWithQuery);
    } catch {
      // keep raw path when it is not valid percent-encoding
    }
    if (!patternToRegex(rule.pattern).test(target) && !patternToRegex(rule.pattern).test(pathWithQuery)) continue;
    const length = rule.pattern.length;
    if (!decision || length > decision.length || (length === decision.length && rule.allow)) {
      decision = { allow: rule.allow, length };
    }
  }
  return decision ? decision.allow : true;
}
