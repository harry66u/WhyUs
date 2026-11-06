import type { Metadata } from "next";
import {
  ClosingCta,
  DraftSpecimen,
  getLandingDemo,
  Hero,
  HowItWorks,
  landingPrices,
  PlansAndPrivacy,
  SourcesSpecimen,
  SwapTestSpecimen,
} from "@/components/landing";

const TITLE = "WhyUs: verified research for every “Why us?” essay";
const DESCRIPTION =
  "WhyUs reads each college’s official pages, verifies every fact, and matches the details to what you have actually done. It never writes your essay.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "WhyUs",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * The landing page. Static: the research demo is built at build time from the
 * verified research bases and the sample student (see components/landing/demo-data).
 */
export default async function LandingPage() {
  const demo = await getLandingDemo();
  return (
    <>
      <Hero demo={demo} />
      <SourcesSpecimen demo={demo} />
      <SwapTestSpecimen demo={demo} />
      <DraftSpecimen />
      <HowItWorks />
      <PlansAndPrivacy prices={landingPrices()} />
      <ClosingCta />
    </>
  );
}
