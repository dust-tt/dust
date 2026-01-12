import type { GetStaticProps } from "next";
import type { ReactElement } from "react";

import { b2bSaasConfig } from "@app/components/home/content/Industry/configs/b2bSaasConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { IndustryPageProps } from "@app/components/home/content/Industry/types";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getCustomerStoriesForIndustry,
} from "@app/lib/contentful/industryStories";

export const getStaticProps: GetStaticProps<IndustryPageProps> = async () => {
  const customerStories = await getCustomerStoriesForIndustry("b2b-saas");

  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      customerStories,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

export default function B2BSaaS({ customerStories }: IndustryPageProps) {
  // Merge fetched customer stories into the config
  const config = {
    ...b2bSaasConfig,
    ...(customerStories && { customerStories }),
  };

  return <IndustryTemplate config={config} trackingPrefix="b2b" />;
}

B2BSaaS.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
