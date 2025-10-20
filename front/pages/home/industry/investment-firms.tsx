import type { ReactElement } from "react";

import { investmentConfig } from "@app/components/home/content/Industry/configs/investmentConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function InvestmentFirms() {
  return (
    <IndustryTemplate config={investmentConfig} trackingPrefix="investment" />
  );
}

InvestmentFirms.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
