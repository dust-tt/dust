import { ChatGptEnterpriseComparisonTable } from "@marketing/components/home/content/ChatGptEnterprise/ChatGptEnterpriseComparisonTable";
import { ChatGptEnterpriseDeepDive } from "@marketing/components/home/content/ChatGptEnterprise/ChatGptEnterpriseDeepDive";
import { ChatGptEnterpriseHeroSection } from "@marketing/components/home/content/ChatGptEnterprise/ChatGptEnterpriseHeroSection";
import { ChatGptEnterpriseLogoBar } from "@marketing/components/home/content/ChatGptEnterprise/ChatGptEnterpriseLogoBar";
import {
  ChatGptEnterpriseWhatSection,
  ChatGptEnterpriseWhySection,
} from "@marketing/components/home/content/ChatGptEnterprise/ChatGptEnterpriseWhatSection";
import { chatGptEnterpriseConfig } from "@marketing/components/home/content/ChatGptEnterprise/config/chatGptEnterpriseConfig";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
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
      <ChatGptEnterpriseHeroSection
        headline={chatGptEnterpriseConfig.hero.headline}
        subtitle={chatGptEnterpriseConfig.hero.subtitle}
        ctaButtonText={chatGptEnterpriseConfig.hero.ctaButtonText}
        ctaButtonLink={chatGptEnterpriseConfig.hero.ctaButtonLink}
        secondaryButtonText={chatGptEnterpriseConfig.hero.secondaryButtonText}
        secondaryButtonLink={chatGptEnterpriseConfig.hero.secondaryButtonLink}
      />

      {/* Logo Bar */}
      <ChatGptEnterpriseLogoBar title={chatGptEnterpriseConfig.logoBarTitle} />

      {/* Dust Deep Dive */}
      <ChatGptEnterpriseDeepDive
        pros={chatGptEnterpriseConfig.dustDeepDive.pros}
        testimonials={chatGptEnterpriseConfig.dustDeepDive.testimonials}
      />

      {/* What is ChatGPT Enterprise? */}
      <ChatGptEnterpriseWhatSection
        title={chatGptEnterpriseConfig.whatIs.title}
        description={chatGptEnterpriseConfig.whatIs.description}
        catchLine={chatGptEnterpriseConfig.whatIs.catchLine}
        approaches={chatGptEnterpriseConfig.whatIs.approaches}
      />

      {/* Why teams look for alternatives */}
      <ChatGptEnterpriseWhySection
        title={chatGptEnterpriseConfig.whyEvaluate.title}
        subtitle={chatGptEnterpriseConfig.whyEvaluate.subtitle}
        reasons={chatGptEnterpriseConfig.whyEvaluate.reasons}
      />

      {/* Comparison Table */}
      <div className="pb-24">
        <ChatGptEnterpriseComparisonTable
          title={chatGptEnterpriseConfig.comparisonTable.title}
          rows={chatGptEnterpriseConfig.comparisonTable.rows}
        />
      </div>
    </>
  );
}

ChatGptEnterpriseLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
