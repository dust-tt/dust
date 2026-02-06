import type { ReactElement } from "react";

import { ComparisonTableSection } from "@app/components/home/content/Competitive/ComparisonTableSection";
import { CompetitiveHeroSection } from "@app/components/home/content/Competitive/CompetitiveHeroSection";
import { gleanConfig } from "@app/components/home/content/Competitive/config/gleanConfig";
import { DifferentiatorsSection } from "@app/components/home/content/Competitive/DifferentiatorsSection";
import { EmailCTASection } from "@app/components/home/content/Competitive/EmailCTASection";
import { StatsSection } from "@app/components/home/content/Competitive/StatsSection";
import { TestimonialsGridSection } from "@app/components/home/content/Competitive/TestimonialsGridSection";
import { H4 } from "@app/components/home/ContentComponents";
import { FAQ } from "@app/components/home/FAQ";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
    },
  };
}

export default function GleanLandingPage() {
  return (
    <>
      <PageMetadata
        title="Dust vs Glean: AI Agents That Work, Not Just Search"
        description="Compare Dust and Glean. While Glean focuses on search, Dust builds AI agents that execute tasks, automate workflows, and work alongside your team."
        pathname="/landing/glean"
      />

      {/* Hero Section */}
      <CompetitiveHeroSection
        chip={gleanConfig.hero.chip}
        headline={gleanConfig.hero.headline}
        postItText={gleanConfig.hero.postItText}
        valuePropTitle={gleanConfig.hero.valuePropTitle}
        valueProps={gleanConfig.hero.valueProps}
        ctaButtonText={gleanConfig.hero.ctaButtonText}
        trustBadges={gleanConfig.hero.trustBadges}
        trackingObject="glean_hero"
      />

      {/* Trusted By */}
      <div className="-mt-8">
        <H4 className="mb-6 w-full text-center text-muted-foreground">
          TRUSTED BY TEAMS WHO SWITCHED FROM GLEAN
        </H4>
        <TrustedBy showTitle={false} />
      </div>

      {/* Testimonials */}
      <div className="mt-8">
        <TestimonialsGridSection
          testimonials={gleanConfig.testimonials}
          title="What teams are saying"
        />
      </div>

      {/* Comparison Table */}
      <div className="mt-8">
        <ComparisonTableSection
          dustHeader={gleanConfig.comparison.dustHeader}
          competitorHeader={gleanConfig.comparison.competitorHeader}
          competitorLogo="/static/landing/logos/gray/glean.svg"
          features={gleanConfig.comparison.features}
        />
      </div>

      {/* Differentiators */}
      <div className="mt-8">
        <DifferentiatorsSection
          differentiators={gleanConfig.differentiators}
          title="What makes Dust different"
        />
      </div>

      {/* Stats */}
      <div className="mt-8">
        <StatsSection
          stats={gleanConfig.stats}
          title="Results that speak for themselves"
        />
      </div>

      {/* FAQ */}
      <div className="mt-8">
        <FAQ items={gleanConfig.faq} title="Frequently asked questions" />
      </div>

      {/* Bottom CTA */}
      <div className="mt-8">
        <EmailCTASection
          title={gleanConfig.cta.title}
          subtitle={gleanConfig.cta.subtitle}
          buttonText={gleanConfig.cta.buttonText}
          trustBadges={gleanConfig.cta.trustBadges}
          trackingObject="glean_cta_bottom"
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
