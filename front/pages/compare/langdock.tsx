import type { ReactElement } from "react";

import CompetitorTemplate from "@app/components/home/content/Competitor/CompetitorTemplate";
import { langdockConfig } from "@app/components/home/content/Competitor/configs/langdockConfig";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function LangdockComparisonPage() {
  return (
    <CompetitorTemplate config={langdockConfig} trackingPrefix="langdock" />
  );
}

LangdockComparisonPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return CompetitorTemplate.getLayout!(page, pageProps);
};
