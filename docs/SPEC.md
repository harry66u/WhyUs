# WhyUs product spec (client brief)

Build a web app called WhyUs that helps high school seniors research their "Why this college?" supplemental essays. It does the research; it never writes the essay.

USERS
High school seniors, plus parents and college counselors who manage several students.

CORE FLOW
1. Student builds a profile: intended major, interests, and their activities list (paste text or upload their Common App activities or resume as a PDF).
2. Student adds the schools they're applying to. For each, they paste the exact supplemental prompt and word limit, or pick it from a list if we have it.
3. The app researches each school and produces a one-page dossier tailored to that student and prompt.

RESEARCH REQUIREMENTS
- Use only official school sources: current course catalog, department and faculty pages, labs and centers, student organizations, special programs, traditions, and location-based opportunities.
- Scope the research to the unit the prompt names (for example, a specific school or college inside a larger university).
- Every fact must link to the official page it came from and be confirmed on a current page. If a fact can't be verified, leave it out. Never invent courses, professors, labs, or clubs. Show the date each fact was verified.
- Research on a school should be reusable across students and refreshed each term so results are fast.

MATCHING AND RANKING
- Rank findings by how directly they connect to this student's actual activities and interests, with one plain sentence explaining each connection.
- Favor uncommon, specific details over the obvious ones every applicant mentions (famous flagship programs, homepage items, big-name professors). Label overused details as "commonly mentioned."
- Swap test: for each detail, show whether something equivalent exists at the other schools on the student's list. Give each dossier an overall uniqueness score.
- Across a student's schools, avoid recommending the same angle twice.

DOSSIER OUTPUT (per school)
- Top 6 to 8 details, each with: source link, why it fits this student, uniqueness rating.
- 2 or 3 possible essay angles, one line each, as ideas only, no drafted prose.
- 3 specific questions to ask at an info session or a current student.
- Clear note that the tool is for research, consistent with college AI policies.
- Shareable link and PDF export.

DRAFT CHECKER (optional feature)
Student pastes their own draft. The app checks word count against the limit, runs the swap test, verifies every school fact in the draft against official pages, and highlights generic sentences. It points out problems but does not rewrite anything.

PLATFORM
Web first, built for desktop and laptop browsers. It should still work on mobile, but desktop is the priority experience.

DESIGN
The site should look high tech and expensive, on the level of Linear, Stripe, Vercel, and Perplexity. It should feel like a professional research tool, not a homework helper or a typical edtech site.
- Dark, refined aesthetic with a light mode option. Restrained color palette with one signature accent color. Premium typography with strong hierarchy and generous spacing.
- Smooth, subtle motion throughout: page transitions, hover states, and elements that animate in as they load. Nothing cheesy or bouncy.
- Live research view: while a school is being researched, show the work happening in real time, such as the official pages being read, facts being verified, and matches being found, so the user can see how thorough it is. This is the signature moment of the product.
- The dossier should look like a polished intelligence briefing: clean layout, clear source citations, uniqueness scores shown visually, and a PDF export that looks just as good.
- Dashboard shows all of a student's schools with status, uniqueness scores, and progress at a glance.
- Landing page that sells the product in seconds: a clear headline, a live or animated demo of a dossier being built, and the key differentiators (verified official sources, swap test, never writes your essay).
- Results should appear progressively as research finishes, with each school's dossier done within about two minutes.
- No stock illustrations, no emojis, no generic AI gradients or sparkle icons.

ACCOUNTS AND PAYMENT
Accounts with email sign-in. First school free, then $9 per school or $29 for unlimited, via Stripe. Counselor plan that lets one account manage multiple students.

PRIVACY
Student data stays private, is never used to train anything, and can be fully deleted by the student.

DONE WHEN
Using a sample student profile, the app produces dossiers for Dartmouth, Penn, Cornell, Tufts, and Michigan where every link works, every fact is on a current official page, and no two dossiers lead with the same angle.
