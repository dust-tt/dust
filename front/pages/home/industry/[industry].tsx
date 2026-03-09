import { b2bSaasConfig } from "@app/components/home/content/Industry/configs/b2bSaasConfig";
import { consultingConfig } from "@app/components/home/content/Industry/configs/consultingConfig";
import { energyConfig } from "@app/components/home/content/Industry/configs/energyConfig";
import { financialServicesConfig } from "@app/components/home/content/Industry/configs/financialServicesConfig";
import { industrialFirmsConfig } from "@app/components/home/content/Industry/configs/industrialFirmsConfig";
import { insuranceConfig } from "@app/components/home/content/Industry/configs/insuranceConfig";
import { investmentConfig } from "@app/components/home/content/Industry/configs/investmentConfig";
import { marketplaceConfig } from "@app/components/home/content/Industry/configs/marketplaceConfig";
import { mediaConfig } from "@app/components/home/content/Industry/configs/mediaConfig";
import { retailEcommerceConfig } from "@app/components/home/content/Industry/configs/retailEcommerceConfig";
import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getCustomerStoriesForIndustry,
} from "@app/lib/contentful/industryStories";
import { isString } from "@app/types/shared/utils/general";
import type { GetStaticPaths, GetStaticProps } from "next";
import type { ReactElement } from "react";

const INDUSTRY_PAGE_MAP = {
  "b2b-saas": {
    config: b2bSaasConfig,
    trackingPrefix: "b2b",
  },
  consulting: {
    config: consultingConfig,
    trackingPrefix: "consulting",
  },
  "energy-utilities": {
    config: energyConfig,
    trackingPrefix: "energy",
  },
  "financial-services": {
    config: financialServicesConfig,
    trackingPrefix: "financial",
  },
  "industrial-manufacturing": {
    config: industrialFirmsConfig,
    trackingPrefix: "manufacturing",
  },
  insurance: {
    config: insuranceConfig,
    trackingPrefix: "insurance",
  },
  "investment-firms": {
    config: investmentConfig,
    trackingPrefix: "investment",
  },
  marketplace: {
    config: marketplaceConfig,
    trackingPrefix: "marketplace",
  },
  media: {
    config: mediaConfig,
    trackingPrefix: "media",
  },
  "retail-ecommerce": {
    config: retailEcommerceConfig,
    trackingPrefix: "retail",
  },
} as const satisfies Record<
  string,
  { config: IndustryPageConfig; trackingPrefix: string }
>;

type IndustryKey = keyof typeof INDUSTRY_PAGE_MAP;

function isIndustryKey(value: string): value is IndustryKey {
  return value in INDUSTRY_PAGE_MAP;
}

interface IndustryDynamicPageProps {
  gtmTrackingId: string | null;
  customerStories: Awaited<
    ReturnType<typeof getCustomerStoriesForIndustry>
  > | null;
  industryKey: IndustryKey;
}

export const getStaticPaths: GetStaticPaths = async () => {
  // Don't pre-generate any paths at build time to minimize Contentful API calls.
  // Pages are generated on-demand via fallback: "blocking" and cached with ISR.
  return {
    paths: [],
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<IndustryDynamicPageProps> = async ({
  params,
}) => {
  const industryParam = params?.industry;

  if (!isString(industryParam) || !isIndustryKey(industryParam)) {
    return { notFound: true };
  }

  const customerStories = await getCustomerStoriesForIndustry(industryParam);

  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      customerStories,
      industryKey: industryParam,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function IndustryDynamicPage({
  customerStories,
  industryKey,
}: IndustryDynamicPageProps) {
  const { config: baseConfig, trackingPrefix } = INDUSTRY_PAGE_MAP[industryKey];

  const config: IndustryPageConfig = {
    ...baseConfig,
    ...(customerStories && { customerStories }),
  };

  return <IndustryTemplate config={config} trackingPrefix={trackingPrefix} />;
}

IndustryDynamicPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
