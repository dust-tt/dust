import type { ReactElement } from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import { CallToActionSection } from "@app/components/home/content/Product/CallToActionSection";
import { FutureSection } from "@app/components/home/content/Product/FutureSection";
import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { QuoteSection } from "@app/components/home/ContentBlocks";
import { SecurityComplianceSection } from "@app/components/home/ContentComponents";
import { CloudConnectorsSection } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";

export async function getServerSideProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/v90n8beuh9?seo=true&videoFoam=true",
};

export function Landing() {
  return (
    <>
      <IntroSection />
      <CloudConnectorsSection />
      <SecurityComplianceSection />
      <QuoteSection
        quote="Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter and more valuable over time"
        name="Everett Berry"
        title="Head of GTM Engineering at Clay"
        logo="/static/landing/logos/color/clay.png"
      />
      {/* <FutureSection /> */}
      <DemoVideoSection demoVideo={DemoVideo} id="demo-video" />
      <BlogSection />
      <CallToActionSection />
    </>
  );
}

export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
