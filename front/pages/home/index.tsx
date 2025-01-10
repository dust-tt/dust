import type { ReactElement } from "react";
import React from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
import { FutureSection } from "@app/components/home/content/Product/FutureSection";
import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import { TeamSection } from "@app/components/home/content/Product/TeamSection";
import { VerticalSection } from "@app/components/home/content/Product/VerticalSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";

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
