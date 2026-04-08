import { ChatGptEnterpriseDeepDive } from "@app/components/home/content/ChatGptEnterprise/ChatGptEnterpriseDeepDive";
import { chatGptEnterpriseConfig } from "@app/components/home/content/ChatGptEnterprise/config/chatGptEnterpriseConfig";
import { MultiProductComparisonTable } from "@app/components/home/content/Competitive/MultiProductComparisonTable";
import { PaidLandingHeroSection } from "@app/components/home/content/Competitive/PaidLandingHeroSection";
import { PaidLandingLogoBar } from "@app/components/home/content/Competitive/PaidLandingLogoBar";
import {
  PaidLandingWhatSection,
  PaidLandingWhySection,
} from "@app/components/home/content/Competitive/PaidLandingWhatSection";
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
export default function ChatGptEnterpriseLandingPage() {
  return (
    <>
      <PageMetadata
        title="The 6 Best ChatGPT Enterprise Alternatives for Teams in 2026 | Dust"
        description="Compare the top ChatGPT Enterprise alternatives. See why brands like Clay, WhatNot, Persona, and Vanta picked Dust to scale AI at their company."
        pathname="/landing/chatgpt-enterprise"
      />

      {/* Hero Section */}
      <PaidLandingHeroSection
        headline={chatGptEnterpriseConfig.hero.headline}
        subtitle={chatGptEnterpriseConfig.hero.subtitle}
        ctaButtonText={chatGptEnterpriseConfig.hero.ctaButtonText}
        secondaryButtonText={chatGptEnterpriseConfig.hero.secondaryButtonText}
        secondaryButtonLink={chatGptEnterpriseConfig.hero.secondaryButtonLink}
        trackingPrefix="chatgpt_enterprise"
      />

      {/* Logo Bar */}
      <PaidLandingLogoBar title={chatGptEnterpriseConfig.logoBarTitle} />

      {/* Dust Deep Dive */}
      <ChatGptEnterpriseDeepDive
        pros={chatGptEnterpriseConfig.dustDeepDive.pros}
        testimonials={chatGptEnterpriseConfig.dustDeepDive.testimonials}
      />

      {/* What is ChatGPT Enterprise? */}
      <PaidLandingWhatSection
        title={chatGptEnterpriseConfig.whatIs.title}
        description={chatGptEnterpriseConfig.whatIs.description}
        catchLine={chatGptEnterpriseConfig.whatIs.catchLine}
        approaches={chatGptEnterpriseConfig.whatIs.approaches}
      />

      {/* Why teams look for alternatives */}
      <PaidLandingWhySection
        title={chatGptEnterpriseConfig.whyEvaluate.title}
        subtitle={chatGptEnterpriseConfig.whyEvaluate.subtitle}
        reasons={chatGptEnterpriseConfig.whyEvaluate.reasons}
      />

      {/* Comparison Table */}
      <MultiProductComparisonTable
        title={chatGptEnterpriseConfig.comparisonTable.title}
        columns={chatGptEnterpriseConfig.comparisonTable.columns}
        rows={chatGptEnterpriseConfig.comparisonTable.rows}
      />
    </>
  );
}

ChatGptEnterpriseLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
