// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file

import { FinalCTASection } from "@app/components/home/content/Competitor/FinalCTASection";
import { FAQ } from "@app/components/home/FAQ";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { IntegrationBenefitsSection } from "./sections/IntegrationBenefitsSection";
import { IntegrationChatMockupSection } from "./sections/IntegrationChatMockupSection";
import { IntegrationHeroSection } from "./sections/IntegrationHeroSection";
import { RelatedIntegrationsSection } from "./sections/RelatedIntegrationsSection";
import { ToolsSection } from "./sections/ToolsSection";
import { UseCasesSection } from "./sections/UseCasesSection";
import type { IntegrationBase, IntegrationPageConfig } from "./types";
import { getBenefitsForIntegration } from "./utils/benefitsTemplates";
import { getChatStorylineForIntegration } from "./utils/chatMockupTemplates";
import {
  getDefaultSEOMetaDescription,
  getDefaultSEOSubtitle,
  getDefaultSEOTitle,
} from "./utils/seoUtils";

interface IntegrationTemplateProps {
  integration: IntegrationPageConfig;
  relatedIntegrations: IntegrationBase[];
}

// Generate Schema.org SoftwareApplication JSON-LD
function generateIntegrationSchema(integration: IntegrationPageConfig) {
  const features = integration.tools.map((t) => t.displayName);

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${integration.name} Integration for Dust`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      integration.enrichment?.longDescription ?? integration.description,
    featureList: features.length > 0 ? features : undefined,
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      price: "29",
      priceCurrency: "USD",
      description: "Starting from $29/user/month",
    },
  };
}

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

export default function IntegrationTemplate({
  integration,
  relatedIntegrations,
}: IntegrationTemplateProps) {
  const router = useRouter();
  const enrichment = integration.enrichment;

  // New marketing sections: the chat mockup + the benefits grid. Both
  // resolve to hand-authored content when an enrichment override exists,
  // otherwise to the heuristic generator. If the legacy `enrichment.useCases`
  // is present (Slack, Notion, etc.), the new BenefitsSection is suppressed
  // so the page doesn't show two near-identical JTBD strips.
  const chatStoryline = getChatStorylineForIntegration(integration);
  const showLegacyUseCases =
    enrichment?.useCases && enrichment.useCases.length > 0;
  const benefits = showLegacyUseCases
    ? []
    : getBenefitsForIntegration(integration);

  // Use SEO-optimized titles for long-tail queries
  const seoTitle =
    enrichment?.seoTitle ??
    getDefaultSEOTitle(integration.name, integration.category);
  const seoSubtitle =
    enrichment?.seoSubtitle ??
    getDefaultSEOSubtitle(integration.name, integration.category);
  const seoDescription =
    enrichment?.longDescription ??
    getDefaultSEOMetaDescription(integration.name, integration.category);

  // Default CTA config
  const finalCTAConfig = {
    title: `Get started with ${integration.name}`,
    subtitle: `Connect ${integration.name} to Dust and let AI agents handle your workflows.`,
    primaryCTA: {
      label: "Start free trial",
      href: "/api/workos/login?screenHint=sign-up",
    },
    secondaryCTA: {
      label: "Talk to sales",
      href: "/home/contact",
    },
    trustText: "14-day free trial. No credit card required.",
  };

  return (
    <>
      <PageMetadata
        title={seoTitle}
        description={seoDescription}
        pathname={router.asPath}
      />

      {/* Schema.org JSON-LD */}
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(generateIntegrationSchema(integration)),
          }}
        />
        {enrichment?.faq && enrichment.faq.length > 0 && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(generateFAQSchema(enrichment.faq)),
            }}
          />
        )}
      </Head>

      <div className="-mb-24 flex w-full flex-col">
        {/* Hero Section */}
        <IntegrationHeroSection
          integration={integration}
          seoTitle={seoTitle}
          seoSubtitle={seoSubtitle}
        />

        {/* Chat Mockup Section (NEW): animated scripted chat with the partner's MCP. */}
        {chatStoryline && (
          <IntegrationChatMockupSection
            integration={integration}
            storyline={chatStoryline}
          />
        )}

        {/* Tools Section (if MCP server with tools) */}
        {integration.tools.length > 0 && (
          <div className="container px-2">
            <ToolsSection
              tools={integration.tools}
              integrationName={integration.name}
            />
          </div>
        )}

        {/* Benefits Section (NEW): 1-3 JTBD cards. Suppressed when the legacy
            `enrichment.useCases` is present (rendered by UseCasesSection below). */}
        {benefits.length > 0 && (
          <div className="container px-2">
            <IntegrationBenefitsSection
              benefits={benefits}
              integrationName={integration.name}
            />
          </div>
        )}

        {/* Legacy Use Cases Section — only renders when hand-authored useCases
            exist on the partner's enrichment (Slack, Notion, etc.). Kept for
            backward compatibility; new partners should use the Benefits
            section instead. */}
        {showLegacyUseCases && enrichment?.useCases && (
          <div className="container px-2">
            <UseCasesSection
              useCases={enrichment.useCases}
              integrationName={integration.name}
            />
          </div>
        )}

        {/* FAQ Section (if enrichment provided) */}
        {enrichment?.faq && enrichment.faq.length > 0 && (
          <div className="container px-2">
            <div className="py-12 md:py-16">
              <div className="mx-auto max-w-4xl">
                <FAQ
                  title={`Frequently asked questions about ${integration.name}`}
                  items={enrichment.faq}
                />
              </div>
            </div>
          </div>
        )}

        {/* Related Integrations */}
        {relatedIntegrations.length > 0 && (
          <div className="container px-2">
            <RelatedIntegrationsSection integrations={relatedIntegrations} />
          </div>
        )}

        {/* Final CTA */}
        <FinalCTASection
          config={finalCTAConfig}
          trackingPrefix={`integration_${integration.slug}`}
        />
      </div>
    </>
  );
}

IntegrationTemplate.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
