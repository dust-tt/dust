import type { GetStaticProps } from "next";
import type { ReactElement } from "react";

import { financialServicesConfig } from "@app/components/home/content/Industry/configs/financialServicesConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getCustomerStoriesForIndustry,
} from "@app/lib/contentful/industryStories";

import type { IndustryPageProps } from "./types";

export const getStaticProps: GetStaticProps<IndustryPageProps> = async () => {
  const customerStories =
    await getCustomerStoriesForIndustry("financial-services");

  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      customerStories,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

export default function FinancialServices({
  customerStories,
}: IndustryPageProps) {
  const config = {
    ...financialServicesConfig,
    ...(customerStories && { customerStories }),
  };

  return <IndustryTemplate config={config} trackingPrefix="financial" />;
}

FinancialServices.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
