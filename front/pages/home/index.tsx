import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import { FutureSection } from "@app/components/home/content/Product/FutureSection";
import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import { VerticalSection } from "@app/components/home/content/Product/VerticalSection";
import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { QuoteSection } from "@app/components/home/ContentBlocks";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { classNames } from "@app/lib/utils";

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
      <QuoteSection
        quote="Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter and more valuable over time"
        name="Everett Berry"
        title="Head of GTM Engineering at Clay"
        logo="/static/landing/logos/clay.png"
      />
      <VerticalSection />
      <FutureSection />
      <DemoVideoSection
        demoVideo={DemoVideo}
        fromColor="from-sky-200"
        toColor="to-sky-500"
        fullWidth={true}
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
