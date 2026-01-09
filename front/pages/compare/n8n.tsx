import type { ReactElement } from "react";

import CompetitorTemplate from "@app/components/home/content/Competitor/CompetitorTemplate";
import { n8nConfig } from "@app/components/home/content/Competitor/configs/n8nConfig";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function N8nComparisonPage() {
  return <CompetitorTemplate config={n8nConfig} trackingPrefix="n8n" />;
}

N8nComparisonPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return CompetitorTemplate.getLayout!(page, pageProps);
};
