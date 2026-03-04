import { gleanLandingConfig } from "@app/components/home/content/Glean/config/gleanConfig";
import { GleanComparisonTable } from "@app/components/home/content/Glean/GleanComparisonTable";
import { GleanDeepDive } from "@app/components/home/content/Glean/GleanDeepDive";
import { GleanHeroSection } from "@app/components/home/content/Glean/GleanHeroSection";
import { GleanLogoBar } from "@app/components/home/content/Glean/GleanLogoBar";
import { GleanPricingSection } from "@app/components/home/content/Glean/GleanPricingSection";
import {
  GleanWhatSection,
  GleanWhySection,
} from "@app/components/home/content/Glean/GleanWhatSection";
import { FAQ } from "@app/components/home/FAQ";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import type { ReactElement } from "react";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      hideNavigation: true,
    },
  };
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function GleanLandingPage() {
  return (
    <>
      <PageMetadata
        title="The Best Glean Alternatives for Enterprise Teams in 2026 | Dust"
        description="Compare Glean pricing, competitors, and alternatives for enterprise AI. See why teams like G2, Vanta, and WhatNot picked Dust over Glean to scale AI agents at their company."
        pathname="/landing/glean"
      />

      {/* Hero Section */}
      <GleanHeroSection
        headline={gleanLandingConfig.hero.headline}
        subtitle={gleanLandingConfig.hero.subtitle}
        ctaButtonText={gleanLandingConfig.hero.ctaButtonText}
        ctaButtonLink={gleanLandingConfig.hero.ctaButtonLink}
        secondaryButtonText={gleanLandingConfig.hero.secondaryButtonText}
        secondaryButtonLink={gleanLandingConfig.hero.secondaryButtonLink}
      />

      {/* Logo Bar */}
      <GleanLogoBar title={gleanLandingConfig.logoBarTitle} />

      {/* Dust Deep Dive */}
      <GleanDeepDive
        pros={gleanLandingConfig.dustDeepDive.pros}
        testimonials={gleanLandingConfig.dustDeepDive.testimonials}
      />

      {/* What is Glean? */}
      <GleanWhatSection
        title={gleanLandingConfig.whatIs.title}
        description={gleanLandingConfig.whatIs.description}
        catchLine={gleanLandingConfig.whatIs.catchLine}
        approaches={gleanLandingConfig.whatIs.approaches}
      />

      {/* Why teams look for alternatives */}
      <GleanWhySection
        title={gleanLandingConfig.whyEvaluate.title}
        subtitle={gleanLandingConfig.whyEvaluate.subtitle}
        reasons={gleanLandingConfig.whyEvaluate.reasons}
      />

      {/* Pricing */}
      <GleanPricingSection
        title={gleanLandingConfig.pricing.title}
        subtitle={gleanLandingConfig.pricing.subtitle}
        gleanDescription={gleanLandingConfig.pricing.gleanDescription}
        rows={gleanLandingConfig.pricing.rows}
      />

      {/* Comparison Table */}
      <GleanComparisonTable
        title={gleanLandingConfig.comparisonTable.title}
        rows={gleanLandingConfig.comparisonTable.rows}
      />

      {/* FAQ */}
      <div className="mt-8">
        <FAQ
          items={gleanLandingConfig.faq}
          title="Frequently asked questions"
        />
      </div>
    </>
  );
}

GleanLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
