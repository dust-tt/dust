import { ComparisonTableSection } from "@app/components/home/content/Competitive/ComparisonTableSection";
import { CompetitiveCustomersSection } from "@app/components/home/content/Competitive/CompetitiveCustomersSection";
import { CompetitiveHeroSection } from "@app/components/home/content/Competitive/CompetitiveHeroSection";
import { chatgptConfig } from "@app/components/home/content/Competitive/config/chatgptConfig";
import { DifferentiatorsSection } from "@app/components/home/content/Competitive/DifferentiatorsSection";
import { EmailCTASection } from "@app/components/home/content/Competitive/EmailCTASection";
import { SalesAnimationWidget } from "@app/components/home/content/Competitive/SalesAnimationWidget";
import { StatsSection } from "@app/components/home/content/Competitive/StatsSection";
import { TestimonialsGridSection } from "@app/components/home/content/Competitive/TestimonialsGridSection";
import { FAQ } from "@app/components/home/FAQ";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import { OpenaiLogo } from "@dust-tt/sparkle";
import type { ReactElement } from "react";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.GTM_TRACKING_ID ?? null,
      hideNavigation: true,
    },
  };
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function ChatGPTLandingPage() {
  return (
    <>
      <PageMetadata
        title="Dust vs ChatGPT: AI Agents That Close Deals, Not Just Answer Questions"
        description="Compare Dust and ChatGPT for sales teams. While ChatGPT answers questions, Dust builds AI agents that update your CRM, automate follow-ups, and work inside your existing sales stack."
        pathname="/landing/chatgpt"
      />

      {/* Hero Section */}
      <CompetitiveHeroSection
        chip={chatgptConfig.hero.chip}
        headline={chatgptConfig.hero.headline}
        postItText={chatgptConfig.hero.postItText}
        ctaButtonText={chatgptConfig.hero.ctaButtonText}
        trustBadges={chatgptConfig.hero.trustBadges}
        trackingObject="chatgpt_hero"
        animationWidget={<SalesAnimationWidget />}
      />

      {/* Customers */}
      <div className="mt-8">
        <CompetitiveCustomersSection competitorName="ChatGPT" />
      </div>

      {/* Testimonials */}
      <div className="mt-8">
        <TestimonialsGridSection
          testimonials={chatgptConfig.testimonials}
          title="What teams are saying"
        />
      </div>

      {/* Comparison Table */}
      <div className="mt-8">
        <ComparisonTableSection
          title="How Dust Compares to ChatGPT"
          dustHeader={chatgptConfig.comparison.dustHeader}
          competitorHeader={chatgptConfig.comparison.competitorHeader}
          competitorLogo={<OpenaiLogo className="h-10 w-10" />}
          features={chatgptConfig.comparison.features}
        />
      </div>

      {/* Differentiators */}
      <div className="mt-8">
        <DifferentiatorsSection
          differentiators={chatgptConfig.differentiators}
          title="What makes Dust different"
        />
      </div>

      {/* Stats */}
      <div className="mt-8">
        <StatsSection
          stats={chatgptConfig.stats}
          title="Results that speak for themselves"
        />
      </div>

      {/* FAQ */}
      <div className="mt-8">
        <FAQ items={chatgptConfig.faq} title="Frequently asked questions" />
      </div>

      {/* Bottom CTA */}
      <div className="mt-8">
        <EmailCTASection
          title={chatgptConfig.cta.title}
          subtitle={chatgptConfig.cta.subtitle}
          buttonText={chatgptConfig.cta.buttonText}
          trustBadges={chatgptConfig.cta.trustBadges}
          trackingObject="chatgpt_cta_bottom"
        />
      </div>
    </>
  );
}

ChatGPTLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
