import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";
import React from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import { CapabilitySection } from "@app/components/home/content/Product/CapabilitySection";
import { DifferentiationSection } from "@app/components/home/content/Product/DifferentiationSection";
// import { SecuritySection } from "@app/components/home/content/Product/SecuritySection";
// import { UbiquitySection } from "@app/components/home/content/Product/UbiquitySection";
// import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
// import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import { MetricsSection } from "@app/components/home/content/Product/MetricsSection";
import { VerticalSection } from "@app/components/home/content/Product/VerticalSection";
import { QuoteSection } from "@app/components/home/ContentBlocks";
import { P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { classNames } from "@app/lib/utils";
import { FutureSection } from "@app/components/home/content/Product/FutureSection";

export async function getServerSideProps() {
  return {
    props: {
      shape: 0,
    },
  };
}

// export const DemoVideo: DemoVideoProps = {
//   sectionTitle: "Dust in motion",
//   videoUrl:
//     "https://fast.wistia.net/embed/iframe/r0dwaexoez?seo=true&videoFoam=true",
// };

export function Landing() {
  return (
    <>
      <IntroSection />
      <VerticalSection />
      <MetricsSection />
      <QuoteSection
        quote="Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter and more valuable over time"
        name="Everett Berry"
        title="Head of GTM Engineering at Clay"
        logo="/static/landing/logos/clay.png"
      />
      <FutureSection />
      {/* <DifferentiationSection /> */}
      <CapabilitySection />
      {/* <DemoVideoSection
        demoVideo={DemoVideo}
        fromColor="from-sky-200"
        toColor="to-sky-500"
      /> */}

      <BlogSection />
      <div
        className={classNames(
          "col-span-12 flex flex-col items-center",
          "lg:col-span-12 lg:col-start-1",
          "xl:col-span-10 xl:col-start-2"
        )}
      >
        <div className="mt-4 flex justify-center gap-4">
          <Link href="home/contact" shallow={true}>
            <Button variant="outline" size="md" label="Request a demo" />
          </Link>

          <Link href="home/pricing" shallow={true}>
            <Button
              variant="highlight"
              size="md"
              label="Try Dust now"
              icon={RocketIcon}
            />
          </Link>
        </div>
      </div>
    </>
  );
}

export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
