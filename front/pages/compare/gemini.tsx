import type { ReactElement } from "react";

import CompetitorTemplate from "@app/components/home/content/Competitor/CompetitorTemplate";
import { geminiConfig } from "@app/components/home/content/Competitor/configs/geminiConfig";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function GeminiComparisonPage() {
  return <CompetitorTemplate config={geminiConfig} trackingPrefix="gemini" />;
}

GeminiComparisonPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return CompetitorTemplate.getLayout!(page, pageProps);
};
