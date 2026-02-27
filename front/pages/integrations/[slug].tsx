// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file

// Import all enrichment configs
import { integrationEnrichments } from "@app/components/home/content/Integration/configs";
import IntegrationTemplate from "@app/components/home/content/Integration/IntegrationTemplate";
import type {
  IntegrationBase,
  IntegrationEnrichment,
  IntegrationPageConfig,
} from "@app/components/home/content/Integration/types";
import {
  buildIntegrationRegistry,
  getRelatedIntegrations,
} from "@app/components/home/content/Integration/utils/integrationRegistry";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import type { GetStaticPaths, GetStaticProps } from "next";
import type { ReactElement } from "react";

interface IntegrationPageProps {
  integration: IntegrationPageConfig;
  relatedIntegrations: IntegrationBase[];
}

export const getStaticPaths: GetStaticPaths = async () => {
  const integrations = buildIntegrationRegistry();

  return {
    paths: integrations.map((integration) => ({
      params: { slug: integration.slug },
    })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<IntegrationPageProps> = async ({
  params,
}) => {
  const slug = params?.slug as string;
  const integrations = buildIntegrationRegistry();
  const integration = integrations.find((i) => i.slug === slug);

  if (!integration) {
    return { notFound: true };
  }

  // Get enrichment if available (use null instead of undefined for JSON serialization)
  const enrichment: IntegrationEnrichment | null =
    integrationEnrichments[slug] ?? null;

  // Get related integrations
  const related = getRelatedIntegrations(integration, 4);

  return {
    props: {
      integration: {
        ...integration,
        enrichment,
      },
      relatedIntegrations: related,
    },
  };
};

export default function IntegrationPageNextJS({
  integration,
  relatedIntegrations,
}: IntegrationPageProps) {
  return (
    <IntegrationTemplate
      integration={integration}
      relatedIntegrations={relatedIntegrations}
    />
  );
}

IntegrationPageNextJS.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IntegrationTemplate.getLayout!(page, pageProps);
};
