import type { ReactElement } from "react";

import { marketplaceConfig } from "@app/components/home/content/Industry/configs/marketplaceConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function Marketplace() {
  return (
    <IndustryTemplate config={marketplaceConfig} trackingPrefix="marketplace" />
  );
}

Marketplace.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
