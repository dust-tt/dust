import type { ReactElement } from "react";

import { retailEcommerceConfig } from "@app/components/home/content/Industry/configs/retailEcommerceConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function RetailEcommerce() {
  return (
    <IndustryTemplate config={retailEcommerceConfig} trackingPrefix="retail" />
  );
}

RetailEcommerce.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
