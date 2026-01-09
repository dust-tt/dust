import type { ReactElement } from "react";

import CompetitorTemplate from "@app/components/home/content/Competitor/CompetitorTemplate";
import { chatgptConfig } from "@app/components/home/content/Competitor/configs/chatgptConfig";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function ChatGPTComparisonPage() {
  return <CompetitorTemplate config={chatgptConfig} trackingPrefix="chatgpt" />;
}

ChatGPTComparisonPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return CompetitorTemplate.getLayout!(page, pageProps);
};
