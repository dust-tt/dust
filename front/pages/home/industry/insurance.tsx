import type { ReactElement } from "react";

import { insuranceConfig } from "@app/components/home/content/Industry/configs/insuranceConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function Insurance() {
  return (
    <IndustryTemplate config={insuranceConfig} trackingPrefix="insurance" />
  );
}

Insurance.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
