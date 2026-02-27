import { ComparisonTableSection } from "@app/components/home/content/Competitive/ComparisonTableSection";
import { CompetitiveHeroSection } from "@app/components/home/content/Competitive/CompetitiveHeroSection";
import { chatgptCsConfig } from "@app/components/home/content/Competitive/config/chatgptCsConfig";
import { DifferentiatorsSection } from "@app/components/home/content/Competitive/DifferentiatorsSection";
import { EmailCTASection } from "@app/components/home/content/Competitive/EmailCTASection";
import { StatsSection } from "@app/components/home/content/Competitive/StatsSection";
import { TestimonialsGridSection } from "@app/components/home/content/Competitive/TestimonialsGridSection";
import { FAQ } from "@app/components/home/FAQ";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";
import Image from "next/image";
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
export default function ChatGPTCsLandingPage() {
  return (
    <>
      <PageMetadata
        title="Dust vs ChatGPT for Customer Support: AI Agents That Actually Resolve Tickets"
        description="Compare Dust and ChatGPT for your CS team. While ChatGPT answers questions, Dust builds AI agents that resolve tickets, automate workflows, and integrate with Zendesk, Intercom, and more."
        pathname="/landing/chatgpt-cs"
      />

      {/* Hero Section */}
      <CompetitiveHeroSection
        chip={chatgptCsConfig.hero.chip}
        headline={chatgptCsConfig.hero.headline}
        postItText={chatgptCsConfig.hero.postItText}
        valuePropTitle={chatgptCsConfig.hero.valuePropTitle}
        valueProps={chatgptCsConfig.hero.valueProps}
        ctaButtonText={chatgptCsConfig.hero.ctaButtonText}
        trustBadges={chatgptCsConfig.hero.trustBadges}
        trackingObject="chatgpt_cs_hero"
      />

      {/* Trusted By */}
      <div className="mt-8">
        <TrustedBy logoSet="landing" />
      </div>

      {/* Testimonials */}
      <div className="mt-8">
        <TestimonialsGridSection
          testimonials={chatgptCsConfig.testimonials}
          title="What best customer success teams are saying"
        />
      </div>

      {/* Comparison Table */}
      <div className="mt-8">
        <ComparisonTableSection
          dustHeader={chatgptCsConfig.comparison.dustHeader}
          competitorHeader={chatgptCsConfig.comparison.competitorHeader}
          competitorLogo={
            <Image
              src="/static/landing/compare/chatgpt.svg"
              alt="ChatGPT"
              width={44}
              height={44}
              unoptimized
            />
          }
          features={chatgptCsConfig.comparison.features}
          title="How Dust Compares to ChatGPT Enterprise"
        />
      </div>

      {/* Differentiators */}
      <div className="mt-8">
        <DifferentiatorsSection
          differentiators={chatgptCsConfig.differentiators}
          title="What makes Dust different for CS"
        />
      </div>

      {/* Stats */}
      <div className="mt-8">
        <StatsSection
          stats={chatgptCsConfig.stats}
          title="Results that speak for themselves"
        />
      </div>

      {/* FAQ */}
      <div className="mt-8">
        <FAQ items={chatgptCsConfig.faq} title="Frequently asked questions" />
      </div>

      {/* Bottom CTA */}
      <div className="mt-8">
        <EmailCTASection
          title={chatgptCsConfig.cta.title}
          subtitle={chatgptCsConfig.cta.subtitle}
          buttonText={chatgptCsConfig.cta.buttonText}
          trustBadges={chatgptCsConfig.cta.trustBadges}
          trackingObject="chatgpt_cs_cta_bottom"
        />
      </div>
    </>
  );
}

ChatGPTCsLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
