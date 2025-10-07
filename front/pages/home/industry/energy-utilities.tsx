import type { ReactElement } from "react";

import { energyConfig } from "@app/components/home/content/Industry/configs/energyConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function EnergyUtilities() {
  return <IndustryTemplate config={energyConfig} trackingPrefix="energy" />;
}

EnergyUtilities.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
