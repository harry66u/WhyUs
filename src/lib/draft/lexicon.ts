/**
 * Word lists for the draft checker. Generic English and admissions-writing
 * vocabulary only: nothing here describes a particular school.
 */

function set(words: string): Set<string> {
  return new Set(
    words
      .split(/\s+/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Head nouns that end (or start) the official name of a campus group, place, or program. */
export const HEAD_NOUNS = set(`
lab labs laboratory laboratories center centers centre centres institute institutes program programs programme society
societies club clubs team teams fellowship fellowships fellows initiative initiatives house houses studio studios project
projects collaborative collaboratives ensemble ensembles station stations orchestra orchestras choir choirs chorus museum
museums library libraries farm farms garden gardens workshop workshops shop shops union observatory observatories
scholars collective collectives incubator accelerator practicum practicums seminar seminars symposium lodge hub
`);

/** Head nouns that start a name followed by "of" or "for": "Institute of ...", "Center for ...". */
export const LEADING_HEADS = set(`
lab laboratory center centre institute program programme society museum library school college office department
`);

/** Nouns that make a capitalized name a place: "Connecticut River", "Cayuga Lake", "Mount Moosilauke". */
export const PLACE_NOUNS = set(`
river rivers lake lakes trail trails mountain mountains valley gorge gorges creek falls park forest island bay pond
hill hills woods notch range coast square street avenue reservoir canal harbor harbour peninsula glen
`);

export const PLACE_PREFIXES = set(`mount mt lake`);

/** Lowercase words allowed inside a capitalized name ("Institute of Arctic Studies", "Trip to the Sea"). */
export const CONNECTORS = set(`of for and & the on in at de del la le du von van y to`);

/** Connectors that can follow a head noun and continue the name ("Center for", "Institute of"). */
export const NAME_TAIL_CONNECTORS = set(`of for in on`);

/**
 * Generic words in official names. A name made only of these ("Outing Club",
 * "Writing Center", "Environmental Studies") could belong to many schools, so
 * it is not evidence that the student meant one particular school.
 */
export const COMMON_NAME_WORDS = set(`
the a an of for and in on at to with by from
lab labs laboratory center centre institute program programs society club team fellowship initiative house studio project
collaborative ensemble station orchestra choir chorus museum library farm garden gardens workshop workshops shop union group
office department school college university hall council network studies study science sciences arts art research student
students undergraduate first year years trip trips winter spring summer fall night week day carnival homecoming
environmental environment engineering energy climate water sustainability sustainable action policy public social impact
international global community civic service outdoor outdoors outing jazz music musical band symphony chamber marching
theater theatre dance film media writing career honors abroad seminar living learning residential humanitarian racing formula
solar robotics cycling bikes bike debate forensic forensics model mock trial newspaper radio organic special collections
spaces space applied data computer computing design innovation entrepreneurship leadership global health medical medicine
law business economics history language languages culture cultural heritage american african asian latin latino latinx
native indigenous women gender sexuality queer black hispanic jewish muslim christian catholic interfaith religious
physics chemistry biology math mathematics statistics psychology neuroscience philosophy english literature creative
geography geology earth ocean marine forest forestry agriculture food nutrition animal plant natural resources urban city
planning architecture visual fine performing new old north south east west central great high upper lower main campus
foreign exchange semester quarter term summer scholars scholar fellows fellow practicum practicums
`);

/** Words in unit names that do not identify a school ("School of Engineering", "College of Arts and Sciences"). */
export const GENERIC_UNIT_WORDS = set(`
the of and & school college university faculty division arts art sciences science engineering applied business nursing
information public policy music theatre theater dance design architecture urban planning environment sustainability
literature human ecology agriculture life computing hotel administration industrial labor relations economics management
fine museum technology health medicine law education social work graduate undergraduate studies
`);

/** Acronyms that are common outside any one school; never treated as a school's unit name. */
export const COMMON_ACRONYMS = set(`
sat act psat ap ib gpa covid toefl ielts lsat mcat gre gmat frc ftc fll vex first nasa noaa epa usda nsf nih stem steam
usaco amc aime usamo mla apa iso isbn pm am us usa uk eu un co2 ngo ngos ceo cto diy tv pc gps html css ai ml vr ar
iot gis cad cs ee ce me bme cis che sas aap cee eecs seas coe mit cmu ucla nyu usc lgbtq lgbtqia bipoc esl ell
dna rna pcr hiv aids who fbi cia nba nfl mlb nhl ncaa jv mun mvp hosa deca fbla nhs ffa jrotc rotc
`);

/** Uppercase prefixes that look like course codes but are not ("SAT 1500", "COVID 19", "SDG 6"). */
export const NOT_COURSE_PREFIXES = set(`
sat act psat ap ib gpa covid toefl ielts lsat mcat gre gmat frc ftc fll vex first nasa noaa epa usda nsf nih stem steam
usaco amc aime usamo mla apa iso isbn pm am us usa uk eu un sdg sdgs co no so ch ph html css js es ipv mp ps xbox windows
ios android usb hdmi grade class room route highway level tier phase step part chapter unit week day year team top
`);

export const US_STATES = set(`
alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana
iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska
nevada ohio oklahoma oregon pennsylvania tennessee texas utah vermont virginia washington wisconsin wyoming
`);

/** Two-word state names, for the same check. */
export const US_STATES_TWO_WORDS = new Set([
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "south carolina",
  "south dakota",
  "rhode island",
  "west virginia",
]);

/* ------------------------------------------------------------------ */
/* Generic writing                                                      */
/* ------------------------------------------------------------------ */

export type ClicheCategory = "prestige" | "praise" | "fit" | "opener" | "impact" | "lesson" | "stock";

export interface Cliche {
  /** Regex source, matched case-insensitively on word boundaries. */
  pattern: string;
  category: ClicheCategory;
}

const C = (category: ClicheCategory, ...patterns: string[]): Cliche[] => patterns.map((pattern) => ({ pattern, category }));

/** Hyphen or space ("world-renowned" / "world renowned"). */
const H = "[-\\s]";

export const CLICHES: Cliche[] = [
  ...C(
    "prestige",
    "prestigious",
    `world${H}renowned`,
    `world${H}class`,
    `world${H}famous`,
    `internationally${H}renowned`,
    `nationally${H}(?:renowned|ranked|recognized)`,
    "renowned",
    "esteemed",
    "acclaimed",
    "illustrious",
    `top${H}ranked`,
    `highly${H}ranked`,
    `top${H}(?:tier|notch)`,
    "elite (?:school|university|college|institution|education)",
    "ivy league",
    "one of the (?:best|top|finest|leading|most prestigious)",
    "best (?:school|university|college|program)s? in the (?:country|nation|world)",
    "(?:excellent|stellar|outstanding|strong|great) reputation",
    "academic excellence",
  ),
  ...C(
    "praise",
    "diverse (?:community|student body|campus|environment|population)",
    "diversity of (?:the )?(?:student body|students|thought|perspectives)",
    "vibrant",
    `close${H}knit`,
    `tight${H}knit`,
    "(?:welcoming|supportive|inclusive|collaborative|friendly|tight) community",
    "sense of (?:community|belonging)",
    "(?:beautiful|gorgeous|stunning|picturesque|lovely|breathtaking) campus",
    "campus is (?:beautiful|gorgeous|stunning|breathtaking)",
    "rigorous (?:academics|curriculum|coursework|classes|courses|education|academic programs?)",
    "academic rigor",
    "(?:strong|excellent|great|amazing|outstanding|incredible) academics",
    "(?:endless|countless|limitless|unlimited|infinite|numerous|boundless) opportunities",
    "(?:plethora|wealth|abundance|myriad|multitude|array|host|variety) of (?:opportunities|resources|clubs|options)",
    "wide (?:range|variety|array) of (?:opportunities|resources|clubs|classes|courses|programs|options)",
    "unparalleled",
    "unmatched",
    "second to none",
    `state${H}of${H}the${H}art`,
    `cutting${H}edge`,
    "(?:renowned|world-class|distinguished|brilliant|amazing|incredible) (?:faculty|professors)",
    "small class sizes",
    "student-to-faculty ratio",
    "student to faculty ratio",
    `real${H}world (?:experience|applications?|skills)`,
    `hands${H}on (?:learning|experience|opportunities)`,
    "well-rounded education",
    "liberal arts education",
  ),
  ...C(
    "fit",
    "perfect (?:fit|match|place|school|college|environment|home)",
    "ideal (?:fit|place|school|college|environment|match)",
    "(?:right|best) fit",
    "dream (?:school|college|university)",
    "home away from home",
    "(?:feel|felt|feels) (?:right )?at home",
    "where I (?:truly )?belong",
    "the place for me",
    "(?:fits|fit) me perfectly",
  ),
  ...C(
    "opener",
    "(?:ever )?since I was (?:young|little|a (?:young )?(?:child|kid|girl|boy))",
    "from a young age",
    "at a young age",
    "for as long as I can remember",
    "I(?: have|'ve|’ve) always been (?:passionate|fascinated|interested|intrigued|drawn|curious)",
    "I(?: have|'ve|’ve) always (?:loved|wanted|dreamed|known)",
    "my passion for",
    "(?:deeply|truly|extremely|very) passionate",
  ),
  ...C(
    "impact",
    "make a (?:real |lasting |positive |meaningful )?(?:difference|impact)",
    "change the world",
    "give back to (?:my|the) community",
    "follow my (?:dreams|passions?)",
    "reach my (?:full )?potential",
    "achieve my (?:goals|dreams)",
    "the best version of myself",
    "grow as a person",
    "step (?:out|outside) of my comfort zone",
    "(?:broaden|expand|widen) my horizons",
    "think outside the box",
    "hit the ground running",
    "leave my mark",
    "a world of possibilities",
  ),
  ...C(
    "lesson",
    "(?:taught|teaches|showed|shown) me the (?:importance|value|power) of",
    "learned the (?:importance|value|power) of",
  ),
];

/** Praise words that, said about the school with nothing specific, make a sentence generic. */
export const PRAISE_WORDS = set(`
amazing incredible excellent exceptional outstanding strong great renowned prestigious top leading best wonderful fantastic
unique unparalleled unmatched extraordinary impressive remarkable robust rich vibrant welcoming supportive inclusive diverse
rigorous beautiful stunning gorgeous inspiring inspirational innovative distinguished esteemed acclaimed premier superb
phenomenal awesome terrific perfect ideal stellar unrivaled world-class
`);

/** Nouns every school can claim ("opportunities", "community", "resources"). */
export const GENERIC_NOUNS = set(`
academics academic opportunities opportunity resources resource community communities faculty professors professor students
student campus environment atmosphere culture education experience experiences program programs clubs club organizations
organization research curriculum classes class courses course traditions tradition spirit values value mission location
facilities facility network alumni school college university institution place home people peers classmates friends
diversity reputation approach emphasis focus commitment dedication passion passions interests interest goals goal dreams
future career careers life world variety range array lot lots things thing aspects aspect parts part way ways chance chances
access support excellence learning growth knowledge skills skill perspectives perspective ideas idea minds mind
undergraduate undergraduates teaching liberal interdisciplinary collaborative collaboration innovation leadership service
intellectual curiosity discovery inquiry exploration engagement impact mentorship mentors guidance connections relationships
`);

/** Verbs and adjectives that carry no school-specific content in "Why us" sentences. */
export const GENERIC_FILLER = set(`
offer offers offered offering provide provides provided providing allow allows allowed help helps helped grow growing
learn learning explore exploring pursue pursuing achieve develop developing become becoming contribute contributing thrive
succeed gain gaining experience find finding make making take taking give giving get getting have having want wanted love
loved like liked enjoy appreciate believe know think feel felt see seen drawn attracted excited eager able many much
numerous various diverse different new great good best better also truly really very especially particularly incredibly
deeply always never every each all both such well even still just only own whole entire full fully important unique perfect
ideal special wonderful amazing excellent strong top leading outstanding incredible beautiful vibrant rich open free right
plan plans hope hoping look looking forward wait cannot can't join joining attend attending study studying major majoring
continue continuing passion passionate interested interest dream dreams goal goals future career
`);

/** Plain English function words (ignored when judging what a sentence is about). */
export const FUNCTION_WORDS = set(`
a about above across after again against all also am among an and any are around as at be been before being below between
both but by can could did do does doing down during each either else even ever every few for from further had has have
having he her here hers him his how however i if in into is it its itself just less like may me might more most much must my
near neither no nor not now of off often on once one only onto or other others our ours out over own per rather same she
should since so some such than that the their theirs them then there these they this those through thus to too toward towards
under until up upon us very via was we well were what when where whether which while who whom whose why will with within
without would yet you your yours i'm i've i'd i'll it's that's there's can't won't don't
`);

/** Sentence shapes that state what every school claims ("Dartmouth's commitment to ...", "what draws me to ..."). */
export const GENERIC_STRUCTURES: RegExp[] = [
  /\b(?:commitment|dedication|devotion|emphasis|focus) (?:to|on)\b/i,
  /\b(?:drawn|attracted) to\b/i,
  /\bwhat (?:draws|attracts|excites|interests) me (?:to|about)\b/i,
  /\b(?:offers|provides|has|have) (?:so )?(?:many|numerous|countless|plenty of|a lot of|lots of|tons of)\b/i,
  /\beverything (?:\w+ )?(?:has|have) to offer\b/i,
  /\b(?:is|would be) (?:the|a|an) (?:great|good|wonderful|perfect|ideal|excellent|amazing) (?:place|fit|choice|school|college|university|environment)\b/i,
];

/** Words that make a sentence about the school in general ("the university", "your campus"). */
export const SCHOOL_WORDS = set(`campus university college school institution`);

/** Phrases that put a sentence in the student's future at the school. */
export const FUTURE_CUES =
  /\b(?:will|would|could|can't wait|cannot wait|hope|hoping|plan|planning|look forward|looking forward|excited to|eager to|want to|wish to|intend|aspire|dream of|imagine|envision|next (?:fall|year)|as an? (?:\w+ )?(?:student|major|freshman|first-year|undergraduate))\b/i;

/** First person ("I", "my", "we"). */
export const FIRST_PERSON = /(?:\bI\b|\bI['’](?:m|ve|d|ll)\b|\b(?:me|my|mine|myself|we|our|ours|us)\b)/i;
