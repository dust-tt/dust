import type { ReactElement } from "react";

import { b2bSaasConfig } from "@app/components/home/content/Industry/configs/b2bSaasConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function B2BSaaS() {
  return <IndustryTemplate config={b2bSaasConfig} trackingPrefix="b2b" />;
}

B2BSaaS.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
