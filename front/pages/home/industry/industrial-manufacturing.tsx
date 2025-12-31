import type { GetStaticProps } from "next";
import type { ReactElement } from "react";

import { industrialFirmsConfig } from "@app/components/home/content/Industry/configs/industrialFirmsConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import {
  CONTENTFUL_REVALIDATE_SECONDS,
  getCustomerStoriesForIndustry,
} from "@app/lib/contentful/industryStories";

export const getStaticProps: GetStaticProps = async () => {
  const customerStories = await getCustomerStoriesForIndustry(
    "industrial-manufacturing"
  );

  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      customerStories,
    },
    revalidate: CONTENTFUL_REVALIDATE_SECONDS,
  };
};

interface IndustrialFirmsProps {
  gtmTrackingId: string | null;
  customerStories: Awaited<
    ReturnType<typeof getCustomerStoriesForIndustry>
  > | null;
}

export default function IndustrialFirms({
  customerStories,
}: IndustrialFirmsProps) {
  const config = {
    ...industrialFirmsConfig,
    ...(customerStories && { customerStories }),
  };

  return <IndustryTemplate config={config} trackingPrefix="manufacturing" />;
}

IndustrialFirms.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
