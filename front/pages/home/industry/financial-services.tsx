import type { ReactElement } from "react";

import { financialServicesConfig } from "@app/components/home/content/Industry/configs/financialServicesConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function FinancialServices() {
  return (
    <IndustryTemplate
      config={financialServicesConfig}
      trackingPrefix="financial"
    />
  );
}

FinancialServices.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
