// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file

// Import all enrichment configs
import { integrationEnrichments } from "@marketing/components/home/content/Integration/configs";
import IntegrationTemplate from "@marketing/components/home/content/Integration/IntegrationTemplate";
import type {
  IntegrationBase,
  IntegrationEnrichment,
  IntegrationPageConfig,
} from "@marketing/components/home/content/Integration/types";
import { getRelatedIntegrations } from "@marketing/components/home/content/Integration/utils/integrationRegistry";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import { fetchPublicIntegrations } from "@marketing/lib/api/integrations";
import type { GetServerSideProps } from "next";
import type { ReactElement } from "react";

interface IntegrationPageProps {
  integration: IntegrationPageConfig;
  relatedIntegrations: IntegrationBase[];
}

export const getServerSideProps: GetServerSideProps<
  IntegrationPageProps
> = async ({ params }) => {
  const slug = params?.slug as string;
  const integrations = await fetchPublicIntegrations();
  const integration = integrations.find((i) => i.slug === slug);

  if (!integration) {
    return { notFound: true };
  }

  const enrichment: IntegrationEnrichment | null =
    integrationEnrichments[slug] ?? null;

  const related = getRelatedIntegrations(integrations, integration, 4);

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
