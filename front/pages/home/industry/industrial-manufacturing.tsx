import type { ReactElement } from "react";

import { industrialFirmsConfig } from "@app/components/home/content/Industry/configs/industrialFirmsConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function IndustrialFirms() {
  return (
    <IndustryTemplate
      config={industrialFirmsConfig}
      trackingPrefix="manufacturing"
    />
  );
}

IndustrialFirms.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
