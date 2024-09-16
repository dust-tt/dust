import type { ReactElement } from "react";
import React from "react";

import { BlogSection } from "@app/pages/site/components/content/Product/BlogSection";
import { FutureSection } from "@app/pages/site/components/content/Product/FutureSection";
import { IntroSection } from "@app/pages/site/components/content/Product/IntroSection";
import { TeamSection } from "@app/pages/site/components/content/Product/TeamSection";
import { VerticalSection } from "@app/pages/site/components/content/Product/VerticalSection";
import type { LandingLayoutProps } from "@app/pages/site/components/LandingLayout";
import LandingLayout from "@app/pages/site/components/LandingLayout";

export async function getServerSideProps() {
  return {
    props: {
      shape: 0,
    },
  };
}

export function Landing() {
  return (
    <>
      <IntroSection />
      <TeamSection />
      <FutureSection />
      <BlogSection />
      <VerticalSection />
    </>
  );
}

export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
