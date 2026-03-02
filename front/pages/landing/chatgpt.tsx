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
          competitorLogo={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="#000000"
              className="h-10 w-10"
            >
              <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
            </svg>
          }
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
