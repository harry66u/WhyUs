import type { Metadata } from "next";
import { Suspense } from "react";
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
import { DeletedNotice } from "@/components/landing/deleted-notice";
import { SOCIAL_IMAGE } from "@/components/landing/social";

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
    images: [{ ...SOCIAL_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE.alt }],
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
      <Suspense fallback={null}>
        <DeletedNotice />
      </Suspense>
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
