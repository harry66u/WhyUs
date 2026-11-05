/**
 * Controlled vocabulary of themes shared by corpus facts and student profiles.
 *
 * Facts are tagged with theme keys when they enter the corpus (by the research
 * agent or extractor, plus automatic detection). Student activities are tagged
 * with the same detector at match time. Matching, the swap test, and angle
 * de-duplication all reason over these keys, so they must stay stable.
 *
 * `weight` reflects specificity: broad themes (e.g. "global") count less than
 * narrow ones (e.g. "water") when scoring how directly a detail fits a student.
 */

export type ThemeGroup =
  | "environment"
  | "place"
  | "engineering"
  | "computing"
  | "science"
  | "health"
  | "society"
  | "humanities"
  | "arts"
  | "business"
  | "civic"
  | "outdoors"
  | "global"
  | "identity"
  | "academic";

export interface Theme {
  key: string;
  label: string;
  group: ThemeGroup;
  weight: number;
  pattern: RegExp;
}

function t(key: string, label: string, group: ThemeGroup, weight: number, source: string): Theme {
  return { key, label, group, weight, pattern: new RegExp(`\\b(?:${source})`, "i") };
}

export const THEMES: Theme[] = [
  // Environment
  t("water", "Water resources", "environment", 1.4, String.raw`water quality|water resources?|watersheds?\b|rivers?\b|creeks?\b|streams?\b|hydrolog\w*|wetlands?\b|groundwater|drinking water|stormwater|aquatic|lakes?\b|estuar\w*|freshwater|great lakes|water systems?|dissolved oxygen|turbidity`),
  t("climate", "Climate", "environment", 1.2, String.raw`climate|carbon\b|decarboni\w*|emissions\b|greenhouse gas\w*|net[- ]zero|climate resilien\w*`),
  t("energy", "Energy", "environment", 1.2, String.raw`energy\b|solar\b|wind (?:power|energy|turbines?)|batter(?:y|ies)\b|power grid|electric grid|renewables?\b|nuclear\b|fossil fuels?|electrification|power systems|hydrogen\b|fusion energy`),
  t("sustainability", "Sustainability", "environment", 1.0, String.raw`sustainab\w*|green infrastructure|circular economy|recycl\w*|compost\w*|zero waste`),
  t("ecology", "Ecology and conservation", "environment", 1.1, String.raw`ecolog\w*|biodiversity|ecosystems?\b|wildlife|forests?\b|forestry|habitats?\b|conservation\b|botan\w*|plant biology|natural history|ornitholog\w*|birds?\b|birding|entomolog\w*`),
  t("agriculture", "Agriculture and food systems", "environment", 1.2, String.raw`agricultur\w*|farms?\b|farming|food systems?|crops?\b|soils?\b|agroecolog\w*|horticultur\w*|dairy\b|food security|viticultur\w*|animal science`),
  t("earth-science", "Earth science", "environment", 1.1, String.raw`geolog\w*|earth sciences?|geoscien\w*|seismolog\w*|volcan\w*|glaci\w*|oceanograph\w*|atmospher\w*|meteorolog\w*`),
  t("polar", "Arctic and polar studies", "environment", 1.5, String.raw`arctic|antarctic\w*|polar\b|greenland|cryosphere|ice sheets?|northern studies`),
  t("environmental-justice", "Environmental justice", "environment", 1.4, String.raw`environmental justice|climate justice|environmental equity|frontline communit\w*`),
  t("environmental-policy", "Environmental and energy policy", "environment", 1.4, String.raw`environmental polic\w*|climate polic\w*|energy polic\w*|environmental law|environmental governance|natural resources? polic\w*`),
  t("fieldwork", "Field research", "environment", 1.0, String.raw`field (?:research|work|stations?|courses?|stud\w*|sites?|trips?)|fieldwork|field-based`),

  // Place
  t("cities", "Cities and urban life", "place", 1.2, String.raw`urban\w*|cities\b|city planning|built environment|neighborhoods?\b|zoning|housing\b|real estate|smart cit\w*|placemaking|heat islands?`),
  t("transportation", "Transportation and mobility", "place", 1.2, String.raw`transportation|transit\b|mobility\b|autonomous vehicles?|traffic\b|vehicles?\b`),
  t("gis-mapping", "Mapping and GIS", "place", 1.3, String.raw`GIS\b|geographic information|mapping\b|maps?\b|cartograph\w*|spatial analysis|geospatial|remote sensing`),
  t("architecture", "Architecture", "place", 1.2, String.raw`architect\w*|landscape architecture|historic preservation`),

  // Engineering
  t("environmental-engineering", "Environmental engineering", "engineering", 1.5, String.raw`environmental engineering|water treatment|wastewater|air quality|pollut\w*|remediation|environmental systems`),
  t("civil-engineering", "Civil engineering", "engineering", 1.3, String.raw`civil engineering|structural engineering|infrastructure|bridges?\b|construction\b|geotechnical`),
  t("mechanical-engineering", "Mechanical engineering", "engineering", 1.3, String.raw`mechanical engineering|thermodynamics|fluid mechanics|heat transfer|machine design|machining|machine shops?|CAD\b|manufacturing`),
  t("electrical-engineering", "Electrical engineering", "engineering", 1.3, String.raw`electrical engineering|circuits?\b|electronics|signal processing|embedded systems?|microcontrollers?|arduino|raspberry pi|FPGA|power electronics`),
  t("sensors", "Sensors and measurement", "engineering", 1.5, String.raw`sensors?\b|sensing\b|instrumentation|data loggers?|internet of things|IoT\b|telemetry|environmental monitoring|monitoring stations?`),
  t("robotics", "Robotics", "engineering", 1.5, String.raw`robot\w*|autonomous systems|mechatronic\w*|drones?\b|UAVs?\b|FIRST Robotics|FRC\b|VEX\b`),
  t("biomedical-engineering", "Biomedical engineering", "engineering", 1.5, String.raw`biomedical engineering|bioengineering|medical devices?|prosthe\w*|biomechanic\w*|tissue engineering|biomaterials?|rehabilitation engineering`),
  t("aerospace", "Aerospace", "engineering", 1.4, String.raw`aerospace|aeronautic\w*|rockets?\b|rocketry|satellites?\b|spacecraft|space systems|astronaut\w*`),
  t("materials", "Materials science", "engineering", 1.3, String.raw`materials science|materials engineering|nanotechnolog\w*|nanoscale|polymers?\b|semiconductors?`),
  t("chemical-engineering", "Chemical engineering", "engineering", 1.3, String.raw`chemical engineering|process engineering|catalys\w*|reactors?\b`),
  t("engineering-design", "Engineering design", "engineering", 1.2, String.raw`engineering design|design thinking|human-centered design|prototyp\w*|product design|capstone|design challenges?|design studios?`),
  t("making", "Making and repair", "engineering", 1.2, String.raw`maker\w*|makerspaces?|fabricat\w*|3D print\w*|woodworking|tinker\w*|bike repair|repair (?:shop|caf\w*|clinic|workshop)|laser cut\w*|hands-on (?:building|making)`),

  // Computing
  t("computer-science", "Computer science", "computing", 1.0, String.raw`computer science|programming|software|algorithms?\b|coding\b|computational|computing\b`),
  t("ai", "Artificial intelligence", "computing", 1.3, String.raw`artificial intelligence|machine learning|deep learning|neural networks?|natural language processing|computer vision|AI\b`),
  t("data-science", "Data science", "computing", 1.2, String.raw`data science|statistic\w*|data analy\w*|analytics|big data|data visuali\w*|datasets?\b|open data|dashboards?\b|data-driven`),
  t("hci", "Human-computer interaction", "computing", 1.3, String.raw`human-computer interaction|user experience|UX\b|interaction design|user research`),
  t("cybersecurity", "Cybersecurity", "computing", 1.3, String.raw`cybersecurity|computer security|cryptograph\w*|information security`),
  t("information", "Information science", "computing", 1.1, String.raw`information science|information studies|digital librar\w*|social media|online communities|misinformation|information polic\w*`),
  t("games", "Game design", "computing", 1.3, String.raw`game design|video games?|game development|interactive media|esports`),
  t("quantum", "Quantum science", "computing", 1.4, String.raw`quantum`),

  // Science
  t("biology", "Biology", "science", 1.0, String.raw`biolog\w*|molecular|microbio\w*|evolution\w*|organisms?\b|cell biology`),
  t("genetics", "Genetics and genomics", "science", 1.3, String.raw`genetic\w*|genomic\w*|DNA\b|CRISPR|bioinformatic\w*`),
  t("neuroscience", "Neuroscience", "science", 1.3, String.raw`neuroscien\w*|brain\b|neurobiolog\w*`),
  t("chemistry", "Chemistry", "science", 1.1, String.raw`chemistr\w*|biochem\w*|organic chemistry`),
  t("physics", "Physics", "science", 1.1, String.raw`physics|optics|photonics|particle physics`),
  t("astronomy", "Astronomy", "science", 1.3, String.raw`astronom\w*|astrophysic\w*|telescopes?|planetar\w*|observator\w*|space science`),
  t("mathematics", "Mathematics", "science", 1.0, String.raw`mathemat\w*|math\b|calculus|number theory|topology|applied math\w*`),
  t("marine", "Marine and ocean science", "science", 1.3, String.raw`marine\b|oceans?\b|coastal|coral|fisheries|maritime`),
  t("psychology", "Psychology and cognitive science", "science", 1.1, String.raw`psycholog\w*|behavioral science|cognitive science|cognition`),

  // Health
  t("medicine", "Medicine and health care", "health", 1.0, String.raw`medicine\b|medical\b|pre-?med\w*|physicians?|clinical|hospitals?|patients?\b|surgery|health care|healthcare`),
  t("public-health", "Public health", "health", 1.3, String.raw`public health|epidemiolog\w*|global health|health polic\w*|community health|health equity`),
  t("nursing", "Nursing", "health", 1.3, String.raw`nursing|nurses?\b`),
  t("mental-health", "Mental health", "health", 1.3, String.raw`mental health|well-?being|counseling\b|psychiatr\w*`),
  t("disability", "Disability and accessibility", "health", 1.4, String.raw`disabilit\w*|accessib\w*|assistive|inclusive design|deaf\b|blind\b|neurodivers\w*`),
  t("nutrition", "Nutrition and food science", "health", 1.2, String.raw`nutrition\w*|dietetic\w*|food science`),
  t("kinesiology", "Movement science", "health", 1.2, String.raw`kinesiolog\w*|exercise science|sports medicine|athletic training|movement science`),

  // Society and policy
  t("economics", "Economics", "society", 1.0, String.raw`econom\w*|markets?\b|labor\b|inequality`),
  t("political-science", "Politics and government", "society", 1.0, String.raw`political science|politics|government\b|governance|elections?\b|democrac\w*|voting\b|legislat\w*|city council|town meetings?|township|municipal|local government`),
  t("public-policy", "Public policy", "society", 1.0, String.raw`public policy|policy analysis|polic(?:y|ies)\b|policymak\w*|public administration`),
  t("law", "Law", "society", 1.1, String.raw`law\b|legal\b|pre-?law|constitution\w*|courts?\b|criminal justice`),
  t("international-relations", "International affairs", "society", 1.1, String.raw`international relations|international affairs|foreign policy|diplomac\w*|global affairs|security studies|international development`),
  t("sociology", "Sociology", "society", 1.0, String.raw`sociolog\w*|social inequality|demograph\w*`),
  t("anthropology", "Anthropology and archaeology", "society", 1.2, String.raw`anthropolog\w*|archaeolog\w*|ethnograph\w*`),
  t("history", "History", "humanities", 1.0, String.raw`histor(?:y|ies|ical|ian)\w*|archives?\b|archival`),
  t("philosophy", "Philosophy and ethics", "humanities", 1.1, String.raw`philosoph\w*|ethics|ethical\b|moral\b`),
  t("religion", "Religion and spiritual life", "humanities", 1.1, String.raw`religio\w*|theolog\w*|faith\b|spiritual\w*|interfaith`),
  t("education", "Education and teaching", "civic", 1.0, String.raw`education\w*|teaching\b|teachers?\b|tutor\w*|pedagog\w*|K-12|mentor\w*|literacy`),
  t("immigration", "Immigration", "civic", 1.4, String.raw`immigra\w*|refugees?\b|asylum|migrants?\b|newcomers?\b`),
  t("language-access", "Interpretation and language access", "civic", 1.5, String.raw`interpreters?\b|interpreting\b|translation\b|translators?\b|translating\b|ESL\b|English language learners?|English learners?|bilingual|multilingual|language access`),
  t("languages", "Languages and linguistics", "humanities", 1.1, String.raw`foreign languages?|language (?:study|studies|learning|acquisition|courses?|programs?|house)|linguistic\w*|spanish\b|french\b|mandarin|arabic\b|japanese\b|german\b|portuguese\b|korean\b|italian\b|russian\b|hebrew\b`),
  t("latin-america", "Latin America and Latinx communities", "global", 1.3, String.raw`latin america\w*|latinx|latino|latina|hispanic|caribbean|mexic\w*`),

  // Humanities and arts
  t("literature", "Literature", "humanities", 1.0, String.raw`literatur\w*|novels?\b|poetry|poets?\b|fiction|literary`),
  t("creative-writing", "Creative writing", "humanities", 1.3, String.raw`creative writing|writers?\b|writing workshops?|memoir|playwriting|screenwriting|literary magazines?`),
  t("journalism", "Journalism", "humanities", 1.3, String.raw`journalis\w*|newspapers?\b|reporting\b|reporters?\b|media literacy|student newspaper`),
  t("film-media", "Film and media", "arts", 1.2, String.raw`films?\b|filmmak\w*|cinema|documentar\w*|video production|media studies|animation`),
  t("radio-podcast", "Radio and podcasting", "arts", 1.3, String.raw`radio\b|podcast\w*|broadcast\w*`),
  t("theater", "Theater", "arts", 1.2, String.raw`theat(?:er|re)\w*|acting\b|drama\w*|improv\b|improvisational`),
  t("music", "Music", "arts", 1.1, String.raw`music\w*|orchestra\w*|ensembles?\b|choir\w*|choral|bands?\b|music(?:al)? composition|composers?\b|concerts?\b|instrumental|trumpet|saxophone|piano|violin|cello|guitar`),
  t("jazz", "Jazz", "arts", 1.5, String.raw`jazz|big band|combos?\b`),
  t("visual-arts", "Visual arts", "arts", 1.1, String.raw`visual arts?|studio art|painting|drawing|sculpture|printmaking|ceramics|photograph\w*|fine arts?`),
  t("design", "Design", "arts", 1.0, String.raw`graphic design|visual design|typography|design\b`),
  t("museums", "Museums and collections", "arts", 1.2, String.raw`museums?\b|curat\w*|special collections|art collections?|exhibitions?\b|galler(?:y|ies)\b|art history`),
  t("dance", "Dance", "arts", 1.3, String.raw`danc\w*|choreograph\w*`),
  t("classics", "Classics", "humanities", 1.3, String.raw`classics\b|classical studies|ancient (?:greece|rome|world)`),

  // Business
  t("entrepreneurship", "Entrepreneurship", "business", 1.2, String.raw`entrepreneur\w*|startups?\b|start-ups?\b|ventures?\b|incubat\w*|accelerators?\b|founders?\b`),
  t("finance", "Finance", "business", 1.1, String.raw`financ(?:e|ial)\b|investment\w*|investing|banking|accounting|venture capital|fintech`),
  t("business", "Business and management", "business", 0.8, String.raw`business\b|management\b|marketing\b|consulting\b`),
  t("social-enterprise", "Social impact", "business", 1.2, String.raw`social enterprise|social impact|impact investing|nonprofits?\b|non-profits?\b|social entrepreneurship`),
  t("hospitality", "Hospitality", "business", 1.3, String.raw`hospitality|hotels?\b|restaurants?\b|culinary`),

  // Civic and community
  t("community-engagement", "Community engagement", "civic", 1.0, String.raw`community engagement|community-engaged|service[- ]learning|community partners?\b|community partnerships?|community-based|civic engagement|public service|volunteer\w*|engaged learning|community service`),
  t("civic-tech", "Civic technology", "civic", 1.5, String.raw`civic tech\w*|open government|public interest technology|digital government|civic data`),
  t("social-justice", "Social justice", "civic", 1.1, String.raw`social justice|racial justice|anti-racis\w*|human rights|advocacy|activis\w*`),
  t("debate", "Debate and public speaking", "civic", 1.3, String.raw`debat\w*|forensics|mock trial|model UN|Model United Nations|public speaking|rhetoric`),
  t("leadership", "Leadership", "civic", 0.6, String.raw`leadership|student government|student leaders?`),
  t("youth", "Working with young people", "civic", 1.0, String.raw`youth|children|kids\b|teens?\b|young people|summer camps?`),

  // Outdoors and athletics
  t("outdoors", "Outdoors", "outdoors", 1.2, String.raw`outdoors?\b|hiking|backpacking|camping|climbing|trails?\b|skiing|wilderness|canoe\w*|kayak\w*|outing club|mountaineering|backcountry|snowshoe\w*`),
  t("cycling", "Cycling", "outdoors", 1.4, String.raw`bicycl\w*|bikes?\b|biking|cycling|bike co-?op`),
  t("running", "Running", "outdoors", 1.2, String.raw`running\b|cross[- ]country|marathon|track and field|track & field`),
  t("athletics", "Athletics", "outdoors", 0.9, String.raw`athlet\w*|varsity|club sports?|intramural\w*|rowing|crew\b|sailing|swim\w*|soccer|basketball|football|lacrosse|tennis|hockey|volleyball|baseball|softball|fencing|squash\b|wrestling|golf\b`),
  t("fitness", "Fitness and recreation", "outdoors", 0.8, String.raw`fitness|yoga\b|recreation\w*`),

  // Global
  t("study-abroad", "Study abroad", "global", 1.1, String.raw`study abroad|off-campus programs?|foreign study|exchange programs?|global programs?|semester abroad|language study abroad`),
  t("global", "Global perspectives", "global", 0.7, String.raw`global\w*|international\w*|cross-cultural|transnational`),
  t("asia", "Asia", "global", 1.2, String.raw`asia\w*|china\b|chinese\b|japan\w*|korea\w*|india\w*|south asia\w*|east asia\w*`),
  t("africa", "Africa", "global", 1.2, String.raw`africa\w*|sub-saharan`),
  t("middle-east", "Middle East", "global", 1.2, String.raw`middle east\w*|arab\w*|islam\w*|israel\w*|persian\b|turkish\b`),

  // Identity
  t("first-gen", "First-generation and low-income students", "identity", 1.2, String.raw`first-generation|first generation|first-gen|low-income|questbridge`),
  t("lgbtq", "LGBTQ+ community", "identity", 1.2, String.raw`lgbtq\w*|queer|gender and sexuality|transgender`),
  t("cultural-identity", "Cultural identity and heritage", "identity", 1.1, String.raw`cultural (?:centers?|identity|heritage)|heritage\b|diaspora|affinity groups?|multicultural|ethnic studies|asian american|african american|black studies|indigenous|native american`),
  t("women-gender", "Women and gender", "identity", 1.1, String.raw`women's|womens\b|gender studies|feminis\w*|women in (?:stem|science|engineering|computing)`),

  // Academic structure
  t("undergraduate-research", "Undergraduate research", "academic", 0.9, String.raw`undergraduate research|research assistant\w*|research opportunit\w*|independent research|senior thesis|honors thesis|research fellowships?|summer research|research grants?|research programs?|research with faculty`),
  t("interdisciplinary", "Interdisciplinary study", "academic", 0.7, String.raw`interdisciplinary|multidisciplinary|cross-disciplinary|integrated (?:programs?|studies)|dual degrees?|double majors?|joint degrees?`),
  t("first-year", "First-year experience", "academic", 0.8, String.raw`first-year (?:seminars?|programs?|experience|writing)|pre-orientation|residential colleges?|living-learning|learning communit\w*`),
  t("career", "Careers and internships", "academic", 0.7, String.raw`internships?\b|careers?\b|co-?ops?\b|professional development|externships?`),
];

const BY_KEY = new Map(THEMES.map((th) => [th.key, th]));

export const THEME_KEYS: string[] = THEMES.map((th) => th.key);

export function isThemeKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function getTheme(key: string): Theme | undefined {
  return BY_KEY.get(key);
}

export function themeLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function themeWeight(key: string): number {
  return BY_KEY.get(key)?.weight ?? 1;
}

/** Theme keys detected in free text, ordered by weight (most specific first). */
export function detectThemes(text: string): string[] {
  if (!text) return [];
  const hits = THEMES.filter((th) => th.pattern.test(text));
  return hits.sort((a, b) => b.weight - a.weight).map((th) => th.key);
}

/** Merge explicit theme keys with detected ones, dropping unknown keys. */
export function mergeThemes(explicit: string[] | undefined, text: string): string[] {
  const out: string[] = [];
  for (const k of [...(explicit ?? []), ...detectThemes(text)]) {
    if (isThemeKey(k) && !out.includes(k)) out.push(k);
  }
  return out;
}
