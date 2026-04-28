import { IntroSection } from "@app/components/home/content/Product/IntroSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export function Landing() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Dust - Build Custom AI Agents for Your Organization"
        description="Break down knowledge silos and amplify team performance with data-augmented, customizable and secure AI agents. Deploy in minutes, no coding required."
        pathname={router.asPath}
      />
      <IntroSection />
    </>
  );
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
