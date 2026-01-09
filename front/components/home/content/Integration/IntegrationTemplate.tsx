import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { FAQSection } from "@app/components/home/content/Competitor/FAQSection";
import { FinalCTASection } from "@app/components/home/content/Competitor/FinalCTASection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";

import { IntegrationHeroSection } from "./sections/IntegrationHeroSection";
import { RelatedIntegrationsSection } from "./sections/RelatedIntegrationsSection";
import { ToolsSection } from "./sections/ToolsSection";
import { UseCasesSection } from "./sections/UseCasesSection";
import type { IntegrationBase, IntegrationPageConfig } from "./types";

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
    description: integration.enrichment?.longDescription ?? integration.description,
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

  const seoTitle = `${integration.name} Integration | Dust AI Agents`;
  const seoDescription =
    enrichment?.longDescription ??
    `Connect ${integration.name} to Dust and automate your workflows with AI agents. ${integration.description}`;

  // Default CTA config
  const finalCTAConfig = {
    title: `Get started with ${integration.name}`,
    subtitle: `Connect ${integration.name} to Dust and let AI agents handle your workflows.`,
    primaryCTA: {
      label: "Start free trial",
      href: "/home",
    },
    secondaryCTA: {
      label: "Talk to sales",
      href: "/home/booking",
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
          tagline={enrichment?.tagline}
        />

        {/* Tools Section (if MCP server with tools) */}
        {integration.tools.length > 0 && (
          <div className="container px-2">
            <ToolsSection
              tools={integration.tools}
              integrationName={integration.name}
            />
          </div>
        )}

        {/* Use Cases Section (if enrichment provided) */}
        {enrichment?.useCases && enrichment.useCases.length > 0 && (
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
            <FAQSection
              config={{
                title: `Frequently asked questions about ${integration.name}`,
                items: enrichment.faq,
              }}
            />
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
