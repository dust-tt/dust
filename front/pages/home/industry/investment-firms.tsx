import type { ReactElement } from "react";

import { investmentFirmsConfig } from "@app/components/home/content/Industry/configs/investmentFirmsConfig";
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
  return <IndustryTemplate config={investmentFirmsConfig} />;
}

InvestmentFirms.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
