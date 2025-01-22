import type { ReactElement } from "react";
import React from "react";
import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { QuoteSection } from "@app/components/home/ContentBlocks";
import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import { CapabilitySection } from "@app/components/home/content/Product/CapabilitySection";
import { DifferentiationSection } from "@app/components/home/content/Product/DifferentiationSection";
// import { SecuritySection } from "@app/components/home/content/Product/SecuritySection";
// import { UbiquitySection } from "@app/components/home/content/Product/UbiquitySection";
// import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
// import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import { VerticalSection } from "@app/components/home/content/Product/VerticalSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { classNames } from "@app/lib/utils";

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
      <CapabilitySection />
      <VerticalSection />
      <DifferentiationSection />
      {/* <DemoVideoSection
        demoVideo={DemoVideo}
        fromColor="from-sky-200"
        toColor="to-sky-500"
      /> */}
      <QuoteSection
        quote="We estimate that Dust AI assistants removes at least 50,000 hours of work per year, and perhaps a lot more. Some use cases pay off in a matter of hours!"
        name="Aymeric Augustin"
        title="CTO at Qonto"
        logo="/static/landing/logos/qonto.png"
      />
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
