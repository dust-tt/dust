import type { ReactElement } from "react";

import { consultingConfig } from "@app/components/home/content/Industry/configs/consultingConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function ConsultingFirms() {
  return (
    <IndustryTemplate config={consultingConfig} trackingPrefix="consulting" />
  );
}

ConsultingFirms.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
