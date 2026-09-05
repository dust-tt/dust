import { AgentsImproveSection } from "@app/components/home/content/V2/AgentsImproveSection";
import { ClosingCtaSection } from "@app/components/home/content/V2/ClosingCtaSection";
import { CollaborationSection } from "@app/components/home/content/V2/CollaborationSection";
import { EnterpriseSection } from "@app/components/home/content/V2/EnterpriseSection";
import { HeroSection } from "@app/components/home/content/V2/HeroSection";
import { HowAgentsWorkSection } from "@app/components/home/content/V2/HowAgentsWorkSection";
import { SocialProofBar } from "@app/components/home/content/V2/SocialProofBar";
import { TeamUseCasesSection } from "@app/components/home/content/V2/TeamUseCasesSection";
import { TestimonialsSection } from "@app/components/home/content/V2/TestimonialsSection";
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

export function HomeV2() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Dust — AI for the People Who Run the Work"
        description="Turn scattered knowledge and tools into coordinated execution with AI agents that fast-moving teams build, own, and run themselves."
        pathname={router.asPath}
      />
      <HeroSection />
      <SocialProofBar />
      <HowAgentsWorkSection />
      <CollaborationSection />
      <AgentsImproveSection />
      <EnterpriseSection />
      <TeamUseCasesSection />
      <TestimonialsSection />
      <ClosingCtaSection />
    </>
  );
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: v2 homepage
export default function Home() {
  return <HomeV2 />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
