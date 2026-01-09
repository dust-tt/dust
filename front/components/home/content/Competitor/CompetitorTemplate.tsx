import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";

import { CompetitorHeroSection } from "./CompetitorHeroSection";
import { FAQSection } from "./FAQSection";
import { FeatureComparisonTable } from "./FeatureComparisonTable";
import { FinalCTASection } from "./FinalCTASection";
import { MetricsSection } from "./MetricsSection";
import { QuickAnswerBlock } from "./QuickAnswerBlock";
import type { CompetitorTemplateProps, SectionType } from "./types";
import { WhyChooseSection } from "./WhyChooseSection";

// Generate Schema.org FAQPage JSON-LD
function generateFAQSchema(faqItems: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

// Generate Schema.org SoftwareApplication JSON-LD
function generateSoftwareSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dust",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Mac, Windows",
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      price: "29",
      priceCurrency: "USD",
      priceValidUntil: "2026-12-31",
      description: "14-day free trial, transparent pricing from $29/user/month",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "120",
    },
    featureList: [
      "Multi-agent orchestration",
      "50+ integrations (Slack, Notion, Salesforce, GitHub)",
      "SOC 2 Type II certified",
      "Model-agnostic (20+ models: GPT-4, Claude, Gemini)",
      "70-90% adoption rates",
      "5-minute agent creation",
      "Transparent pricing",
    ],
  };
}

export default function CompetitorTemplate({
  config,
  trackingPrefix,
}: CompetitorTemplateProps) {
  const router = useRouter();
  const prefix = trackingPrefix ?? config.competitorName.toLowerCase();

  // Render a section based on its type
  const renderSection = (sectionType: SectionType) => {
    switch (sectionType) {
      case "hero":
        return config.hero ? (
          <CompetitorHeroSection
            key="hero"
            config={config.hero}
            competitorName={config.competitorDisplayName}
            competitorLogo={config.competitorLogo}
            trackingPrefix={prefix}
          />
        ) : null;

      case "quickAnswer":
        return config.quickAnswer ? (
          <QuickAnswerBlock
            key="quickAnswer"
            config={config.quickAnswer}
            competitorName={config.competitorDisplayName}
            competitorLogo={config.competitorLogo}
          />
        ) : null;

      case "corePositioning":
        // Removed - too text-heavy for marketing page
        return null;

      case "featureComparison":
        return config.featureComparison ? (
          <FeatureComparisonTable
            key="featureComparison"
            config={config.featureComparison}
            competitorName={config.competitorDisplayName}
            competitorLogo={config.competitorLogo}
          />
        ) : null;

      case "whyChoose":
        return config.whyChoose ? (
          <WhyChooseSection
            key="whyChoose"
            title={config.whyChoose.title}
            benefits={config.whyChoose.benefits}
          />
        ) : null;

      case "metrics":
        return config.metrics ? (
          <MetricsSection
            key="metrics"
            title={config.metrics.title}
            metrics={config.metrics.metrics}
          />
        ) : null;

      case "whenCompetitorBetter":
        // Removed - too internal for marketing page
        return null;

      case "useCaseFit":
        // Removed - too text-heavy for marketing page
        return null;

      case "faq":
        return config.faq ? <FAQSection key="faq" config={config.faq} /> : null;

      case "finalCTA":
        return config.finalCTA ? (
          <FinalCTASection
            key="finalCTA"
            config={config.finalCTA}
            trackingPrefix={prefix}
          />
        ) : null;

      // These sections are not yet implemented but defined in types
      case "socialProof":
      case "integrationComparison":
      case "discoveryQuestions":
        return null;
    }
  };

  return (
    <>
      <PageMetadata
        title={config.seo.title}
        description={config.seo.description}
        pathname={router.asPath}
      />

      {/* Schema.org JSON-LD */}
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(generateSoftwareSchema()),
          }}
        />
        {config.faq && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(generateFAQSchema(config.faq.items)),
            }}
          />
        )}
      </Head>

      <div className="flex w-full flex-col">
        {config.layout.sections.map((sectionType) => {
          const section = renderSection(sectionType);
          if (!section) {
            return null;
          }

          // These sections don't need container constraint (full-width backgrounds)
          if (
            sectionType === "hero" ||
            sectionType === "metrics" ||
            sectionType === "finalCTA"
          ) {
            return section;
          }

          // Other sections get container wrapper
          return (
            <div key={sectionType} className="container px-2">
              {section}
            </div>
          );
        })}
      </div>
    </>
  );
}

CompetitorTemplate.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
