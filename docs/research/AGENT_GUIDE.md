# Research agent guide: building a verified school corpus

You are building the shared, reusable research base WhyUs uses for one school.
Students' dossiers are assembled from these facts, so every entry must be real,
current, official, and verifiable by the app's own verifier.

## Non-negotiable rules

1. **Official sources only.** A fact's `sourceUrl` must be on one of the school's
   `officialDomains` (any subdomain) or `officialHosts` in `data/schools/<id>.json`.
   Never cite Wikipedia, rankings, Niche, College Confidential, Reddit, student
   blogs not hosted by the school, third-party news, or aggregator sites.
   University news sites (for example `news.cornell.edu`) are official, but prefer
   evergreen program, department, lab, and catalog pages over news stories.
2. **Copy quotes from the page text the app sees.** Read every page with
   `npx tsx scripts/fetch-text.ts <url> --school <id>` and copy `quote` verbatim
   from the printed lines. Never write a quote from memory, from a WebSearch
   snippet, or from WebFetch output (WebFetch paraphrases).
3. **Never invent** courses, professors, labs, clubs, programs, or traditions.
   If you cannot confirm something on a current official page, leave it out.
4. **Current only.** Skip past events, announcements of one-time things, archived
   or discontinued programs, and catalog entries marked as not offered. Prefer the
   2026-27 catalog/roster (or the current one) for courses. Faculty must be listed
   on a current department, lab, or profile page.
5. **Summary and hook may only restate what the quote supports.** No hype words
   ("world-class", "renowned", "prestigious", "cutting-edge"), no added claims.
6. Only edit `data/corpus/<id>.json` and `data/schools/<id>.json` for your school.

## Tools

```bash
npx tsx scripts/fetch-text.ts <url> --school <id>              # numbered lines of the full page text
npx tsx scripts/fetch-text.ts <url> --school <id> --main       # main content only
npx tsx scripts/fetch-text.ts <url> --school <id> --grep "hydrolog|water" --context 2
npx tsx scripts/fetch-text.ts <url> --school <id> --links "lab|center"   # official links on the page
npx tsx scripts/sitemap.ts https://<host>/ --grep "course|lab|center" --max 5000
npx tsx scripts/verify-facts.ts <id> --write                    # lint + live-verify + normalize ids/themes
```

Use WebSearch with `allowed_domains` set to the school's domains to discover
pages, then read them with `fetch-text`. Some hosts are unreachable from this
environment (TLS chains Node cannot validate, bot challenges). `fetch-text` says
so. Do not try to get around a bot challenge, and do not use those hosts as
sources. Record them in `unreachableHosts` and find other official pages instead.

## Fact format (`data/corpus/<id>.json` -> `facts[]`)

```json
{
  "id": "",
  "schoolId": "dartmouth",
  "unitIds": ["thayer"],
  "kind": "course",
  "title": "ENGS 37: Introduction to Environmental Engineering",
  "nameOnPage": "ENGS 37",
  "summary": "An introductory course on how engineers analyze and design systems that protect water, air, and soil quality.",
  "hook": "introduces the engineering analysis behind water, air, and soil quality protection",
  "quote": "<one to three sentences copied verbatim from fetch-text output>",
  "sourceUrl": "https://dartmouth.smartcatalogiq.com/...",
  "sourceTitle": "<page title printed by fetch-text>",
  "themes": ["environmental-engineering", "water"],
  "commonness": "rare",
  "commonnessReason": "",
  "people": [],
  "term": "2026-fall",
  "verifiedAt": null
}
```

(The example values above are illustrative; every real entry must come from a page you read.)

- `id`: leave `""`. `verify-facts --write` computes it.
- `kind`: `course | major | faculty | lab | center | facility | organization | program | tradition | location`.
  - `major`: degree, major, minor, concentration, track.
  - `facility`: shop, studio, field station, collection, makerspace.
  - `organization`: student organization, team, ensemble, publication.
  - `program`: special program (research program, fellowship, off-campus or residential program, first-year program).
  - `location`: an opportunity tied to the place (a nearby landscape, city partnership, regional institution the school runs programs with).
- `unitIds`: the undergraduate unit(s) the detail belongs to; `[]` when open to all undergraduates.
- `title`: the official name as written on the page (courses: `CODE NUM: Title`).
- `nameOnPage`: a short string that appears on the page exactly (course code, official name, person's name).
- `summary`: one plain sentence, third person, at most about 200 characters.
- `hook`: a verb phrase, third person present, lowercase start, at most about 120 characters,
  describing what a student does or gets ("lets undergraduates join faculty research on ...").
- `quote`: verbatim, 1-3 sentences (ideally 60-400 characters) that state the key fact. It may join
  two passages from the same page with `...` (each passage at least 12 characters).
- `themes`: keys from `src/lib/matching/themes.ts` (`THEMES[].key`). The verifier adds detected ones.
- `commonness`:
  - `common`: what many applicants cite. Flagship programs and traditions, items featured on the
    admissions home or "why us" pages, the most famous centers and professors. Explain in `commonnessReason`.
  - `moderate`: known but not ubiquitous.
  - `rare`: specific courses, smaller labs, specific student groups, niche programs, place-based
    partnerships. These are what make a dossier useful.

## Coverage targets (about 55-70 facts)

**Sample student strands (at least 22 facts).** Read `data/sample-student.json`. Cover what this school
genuinely offers for: water quality and watershed science; environmental sensors and engineering design;
climate and energy policy (and debate); cities, urban heat, mapping/GIS and civic data; language access,
immigrant and community engagement; jazz and music ensembles; cycling, making and repair, outdoors.
Do not stretch: if the school has nothing real for a strand, skip it.

**Breadth (at least 30 facts)** so other students get good results: computer science, AI and data;
biology, neuroscience, health and pre-med; humanities and writing; economics, government, law and policy;
business and entrepreneurship; visual arts, theater, music; outdoors, athletics, recreation; study abroad,
languages and global programs; community engagement and service; identity and cultural centers;
traditions (at least 3); location-based opportunities (at least 3).

**Kinds:** course >= 12, major >= 3, faculty >= 3, lab >= 5, center >= 5, facility >= 3,
organization >= 8, program >= 6, tradition >= 3, location >= 3.

**Swap-test equivalents.** Include the everyday categories most schools have so the swap test can find
equivalents: outdoor or outing club, makerspace or machine shop, undergraduate research program,
community engagement center, jazz ensemble, debate team, student newspaper, entrepreneurship center,
environmental club.

## Prompts (`data/schools/<id>.json` -> `prompts[]`)

Record the current **2026-27** supplemental prompts that ask some version of "why this school" (and
other required supplements), per unit when they differ, with exact text and word limits:

```json
{
  "id": "<school>-2026-why",
  "schoolId": "<school>",
  "unitIds": [],
  "cycle": "2026-27",
  "kind": "why_school",
  "title": "Why <School>",
  "text": "<exact prompt text>",
  "wordLimit": { "max": 300 },
  "sourceUrl": "<official admissions page>",
  "verifiedAt": "2026-11-05",
  "note": ""
}
```

Confirm text on an official admissions page with `fetch-text` when possible (then set `verifiedAt` to
today). If the official page is unreachable from here, find the official URL with WebSearch, try
WebFetch on it, and record what you could confirm; set `verifiedAt` to `null` and explain in `note`.
Only include a prompt you are confident is the 2026-27 version.

Also fill in `seedUrls` (15 or more official pages useful for refreshing research: catalog index,
department and research directories, student-organization directory, traditions, location pages),
correct `units` if needed, record `unreachableHosts` (`{host, reason, checkedAt}`), and set
`hasCorpus: true` when done.

## Finish line

`npx tsx scripts/verify-facts.ts <id> --write` reports 0 lint errors, 0 failed, 0 unreachable.
