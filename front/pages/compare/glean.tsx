import type { ReactElement } from "react";

import CompetitorTemplate from "@app/components/home/content/Competitor/CompetitorTemplate";
import { gleanConfig } from "@app/components/home/content/Competitor/configs/gleanConfig";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function GleanComparisonPage() {
  return <CompetitorTemplate config={gleanConfig} trackingPrefix="glean" />;
}

GleanComparisonPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return CompetitorTemplate.getLayout!(page, pageProps);
};
