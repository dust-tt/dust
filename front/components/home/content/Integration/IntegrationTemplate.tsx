import { Button } from "@dust-tt/sparkle";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import { FAQSection } from "@app/components/home/content/shared/FAQSection";
import { H2 } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";

import { IntegrationHeroSection } from "./sections/IntegrationHeroSection";
import { RelatedIntegrationsSection } from "./sections/RelatedIntegrationsSection";
import { ToolsSection } from "./sections/ToolsSection";
import { UseCasesSection } from "./sections/UseCasesSection";
import type {
  IntegrationBase,
  IntegrationFAQItem,
  IntegrationPageConfig,
} from "./types";
import {
  getDefaultSEOMetaDescription,
  getDefaultSEOSubtitle,
  getDefaultSEOTitle,
} from "./utils/seoUtils";

interface IntegrationTemplateProps {
  integration: IntegrationPageConfig;
  relatedIntegrations: IntegrationBase[];
}

// Generate Schema.org structured data for the integration
function generateIntegrationSchema(integration: IntegrationPageConfig) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `Dust ${integration.name} Integration`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: integration.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free trial available",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
    },
  };
}

// Generate FAQ Schema for SEO
function generateFAQSchema(faq: IntegrationFAQItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
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
                title: `${integration.name} Integration FAQ`,
                items: enrichment.faq.map((f) => ({
                  question: f.question,
                  answer: f.answer,
                })),
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

        {/* Final CTA - Full width blue section */}
        <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-primary-800 py-20 md:py-28">
          <div className="mx-auto max-w-4xl px-6">
            <div className="flex flex-col items-center justify-center text-center">
              <H2 className="mb-8 text-4xl font-medium text-white sm:text-5xl md:text-6xl">
                Get started with {integration.name}
              </H2>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <Link href="/home/pricing" shallow={true}>
                  <Button
                    variant="highlight"
                    size="md"
                    label="Start Free Trial"
                    className="w-full sm:w-auto"
                  />
                </Link>
                <Link href="/home/contact" shallow={true}>
                  <Button
                    variant="outline"
                    size="md"
                    label="Contact Sales"
                    className="w-full sm:w-auto"
                  />
                </Link>
              </div>
            </div>
          </div>
        </div>
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
