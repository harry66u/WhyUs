/**
 * UI development fixture. Uses a fictional school ("Example University",
 * example.edu) so placeholder content can never be mistaken for a real fact
 * about a real college. Never render this in production paths.
 */
import { RESEARCH_POLICY_NOTE, type Dossier } from "@/lib/types";

export const EXAMPLE_DOSSIER: Dossier = {
  id: "fixture-dossier",
  applicationId: "fixture-application",
  studentId: "fixture-student",
  schoolId: "example",
  schoolName: "Example University",
  unitId: "engineering",
  unitName: "School of Engineering",
  prompt: {
    text: "Which aspects of the Example University experience prompt your application? In short, why Example?",
    wordLimit: 150,
  },
  generatedAt: "2026-11-05T15:00:00.000Z",
  term: "2026-fall",
  uniquenessScore: 74,
  details: [
    {
      factId: "example:river-lab:000001",
      rank: 1,
      kind: "lab",
      title: "Example River Sensing Lab",
      summary: "A lab where undergraduates build and deploy sensors that monitor water quality in the local river.",
      quote: "Undergraduates in the River Sensing Lab design, build, and deploy low-cost sensors that track water quality along the Example River.",
      sourceUrl: "https://www.example.edu/engineering/river-sensing-lab",
      sourceTitle: "River Sensing Lab | Example University",
      verifiedAt: "2026-11-05",
      fit: {
        sentence: "Builds directly on your Creek Watch sensor network: this lab has undergraduates deploy the same kind of water-quality sensors on a real river.",
        activityIds: ["act-creek-watch"],
        themes: ["water", "sensors"],
        score: 0.92,
      },
      uniqueness: { score: 86, label: "Distinctive", commonlyMentioned: false, reason: "Specific lab; no equivalent found at two of your other schools." },
      swap: [
        { schoolId: "other-a", schoolName: "Other College A", status: "none" },
        { schoolId: "other-b", schoolName: "Other University B", status: "similar", equivalentTitle: "Environmental Monitoring Group" },
      ],
    },
    {
      factId: "example:engs-41:000002",
      rank: 2,
      kind: "course",
      title: "ENGR 41: Watershed Systems",
      summary: "A course on how rainfall, land use, and infrastructure shape the water that reaches a stream.",
      quote: "ENGR 41 examines how rainfall, land use, and infrastructure shape the quantity and quality of water that reaches a stream.",
      sourceUrl: "https://catalog.example.edu/courses/engr-41",
      sourceTitle: "ENGR 41 | Example University Catalog",
      verifiedAt: "2026-11-05",
      fit: {
        sentence: "Connects to your stormwater outfall mapping internship: the course studies how land use changes what reaches a stream.",
        activityIds: ["act-swcd-intern"],
        themes: ["water", "environmental-engineering"],
        score: 0.81,
      },
      uniqueness: { score: 71, label: "Uncommon", commonlyMentioned: false, reason: "A specific course most applicants will not find." },
      swap: [
        { schoolId: "other-a", schoolName: "Other College A", status: "similar", equivalentTitle: "Hydrology" },
        { schoolId: "other-b", schoolName: "Other University B", status: "none" },
      ],
    },
    {
      factId: "example:big-program:000003",
      rank: 3,
      kind: "program",
      title: "Example Scholars Program",
      summary: "The university's flagship program for first-year research, featured on the admissions homepage.",
      quote: "The Example Scholars Program pairs first-year students with faculty research mentors.",
      sourceUrl: "https://admissions.example.edu/scholars",
      sourceTitle: "Example Scholars | Admissions",
      verifiedAt: "2026-11-05",
      fit: {
        sentence: "Fits your independent heat-island project, but most applicants cite this program.",
        activityIds: ["act-heat-map"],
        themes: ["undergraduate-research"],
        score: 0.55,
      },
      uniqueness: { score: 28, label: "Commonly mentioned", commonlyMentioned: true, reason: "Featured on the admissions homepage; many applicants cite it." },
      swap: [
        { schoolId: "other-a", schoolName: "Other College A", status: "equivalent", equivalentTitle: "First-Year Research Program" },
        { schoolId: "other-b", schoolName: "Other University B", status: "equivalent", equivalentTitle: "Undergraduate Research Scholars" },
      ],
    },
  ],
  angles: [
    {
      key: "water-sensing",
      line: "From a creek you instrumented yourself to a river lab that does the same work at scale.",
      factIds: ["example:river-lab:000001", "example:engs-41:000002"],
      activityIds: ["act-creek-watch"],
      themes: ["water", "sensors"],
      isLead: true,
    },
    {
      key: "civic-data",
      line: "Data that reaches a public meeting: your township dashboard and the lab's community reports.",
      factIds: ["example:river-lab:000001"],
      activityIds: ["act-creek-watch", "act-interpreter"],
      themes: ["civic-tech", "community-engagement"],
      isLead: false,
    },
  ],
  questions: [
    { text: "How do first-year students join the River Sensing Lab: through a course, a paid position, or by contacting faculty?", factId: "example:river-lab:000001", audience: "info_session" },
    { text: "Can a first-year student take ENGR 41, or does it fill with upper-level majors?", factId: "example:engs-41:000002", audience: "current_student" },
    { text: "What does a typical week of fieldwork look like for undergraduates in the lab?", factId: "example:river-lab:000001", audience: "current_student" },
  ],
  policyNote: RESEARCH_POLICY_NOTE,
  stats: { pagesRead: 14, pagesBlocked: 1, factsConsidered: 22, factsVerified: 12, factsRejected: 2, durationMs: 41_000, engine: "deterministic" },
};
