import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from "next";
import type { ReactElement } from "react";

import { INTEGRATION_ENRICHMENTS } from "@app/components/home/content/Integration/configs";
import IntegrationTemplate from "@app/components/home/content/Integration/IntegrationTemplate";
import type {
  IntegrationBase,
  IntegrationPageConfig,
} from "@app/components/home/content/Integration/types";
import {
  buildIntegrationRegistry,
  getRelatedIntegrations,
} from "@app/components/home/content/Integration/utils/integrationRegistry";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";

interface IntegrationPageProps {
  integration: IntegrationPageConfig;
  relatedIntegrations: IntegrationBase[];
}

// Serialize for static props
function serializeIntegration(integration: IntegrationBase): IntegrationBase {
  return {
    ...integration,
    tools: integration.tools.map((t) => ({ ...t })),
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  const integrations = buildIntegrationRegistry();

  const paths = integrations.map((integration) => ({
    params: { slug: integration.slug },
  }));

  return {
    paths,
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
    return {
      notFound: true,
    };
  }

  // Get enrichment if available (use null instead of undefined for serialization)
  const enrichment = INTEGRATION_ENRICHMENTS[slug] ?? null;

  const integrationWithEnrichment: IntegrationPageConfig = {
    ...serializeIntegration(integration),
    enrichment,
  };

  const relatedIntegrations =
    getRelatedIntegrations(integration).map(serializeIntegration);

  return {
    props: {
      integration: integrationWithEnrichment,
      relatedIntegrations,
    },
  };
};

export default function IntegrationPage({
  integration,
  relatedIntegrations,
}: InferGetStaticPropsType<typeof getStaticProps>) {
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
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
