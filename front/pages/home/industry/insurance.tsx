import type { GetStaticProps } from "next";
import type { ReactElement } from "react";

import { insuranceConfig } from "@app/components/home/content/Industry/configs/insuranceConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getCustomerStoriesForIndustry,
} from "@app/lib/contentful/industryStories";

import type { IndustryPageProps } from "./types";

export const getStaticProps: GetStaticProps<IndustryPageProps> = async () => {
  const customerStories = await getCustomerStoriesForIndustry("insurance");

  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      customerStories,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

export default function Insurance({ customerStories }: IndustryPageProps) {
  const config = {
    ...insuranceConfig,
    ...(customerStories && { customerStories }),
  };

  return <IndustryTemplate config={config} trackingPrefix="insurance" />;
}

Insurance.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
