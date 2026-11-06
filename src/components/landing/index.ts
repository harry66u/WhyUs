/**
 * The landing page's sections. Server components, except ResearchDemo (client),
 * which the Hero renders with data from getLandingDemo (server, build time).
 */
export { ClosingCta } from "./closing-cta";
export { getLandingDemo } from "./demo-data";
export { Hero } from "./hero";
export { HowItWorks } from "./how-it-works";
export { PlansAndPrivacy } from "./plans-and-privacy";
export { landingPrices } from "./prices";
export { DraftSpecimen, SourcesSpecimen, SwapTestSpecimen } from "./specimens";
export type { LandingDemo } from "./types";
