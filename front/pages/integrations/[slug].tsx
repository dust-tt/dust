import type { GetStaticPaths, GetStaticProps } from "next";
import type { ReactElement } from "react";

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
    fallback: false, // All pages are pre-generated
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

  // Get enrichment if available
  const enrichment: IntegrationEnrichment | undefined =
    integrationEnrichments[slug];

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

export default function IntegrationPage({
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

IntegrationPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IntegrationTemplate.getLayout!(page, pageProps);
};
