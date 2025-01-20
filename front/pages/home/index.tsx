import type { ReactElement } from "react";
import React from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import { ExtensibilitySection } from "@app/components/home/content/Product/ExtensibilitySection";
import { SecuritySection } from "@app/components/home/content/Product/SecuritySection";
import { UbiquitySection } from "@app/components/home/content/Product/FutureSection";
import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import { CapabilitySection } from "@app/components/home/content/Product/TeamSection";
// import { VerticalSection } from "@app/components/home/content/Product/VerticalSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";

export async function getServerSideProps() {
  return {
    props: {
      shape: 0,
    },
  };
}

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust work",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/r0dwaexoez?seo=true&videoFoam=true",
};

export function Landing() {
  return (
    <>
      <IntroSection />
      <CapabilitySection />
      <UbiquitySection />
      <ExtensibilitySection />
      <SecuritySection />
      <DemoVideoSection
        demoVideo={DemoVideo}
        fromColor="from-sky-200"
        toColor="to-sky-500"
      />
      <BlogSection />
      {/* <VerticalSection /> */}
    </>
  );
}

export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
