import type { ReactElement } from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import { JustUseDustSection as ProductJustUseDustSection } from "@app/components/home/content/Product/JustUseDustSection";
import { QuoteSection } from "@app/components/home/ContentBlocks";
import {
  CloudConnectorsSection,
  SecurityComplianceSection,
} from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import UTMPageWrapper from "@app/components/UTMPageWrapper";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export function Landing() {
  return (
    <UTMPageWrapper>
      <IntroSection />
      <div className="mt-16 flex flex-col gap-16 md:gap-20 lg:gap-24">
        <CloudConnectorsSection />
        <SecurityComplianceSection />
        <QuoteSection
          quote="Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter and more valuable over time"
          name="Everett Berry"
          title="Head of GTM Engineering at Clay"
          logo="/static/landing/logos/color/clay.png"
        />
        <BlogSection />
        <ProductJustUseDustSection />
      </div>
    </UTMPageWrapper>
  );
}

export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
