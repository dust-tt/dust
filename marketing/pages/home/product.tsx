import { CapabilitySection } from "@marketing/components/home/content/Product/CapabilitySection";
import { HomeAIOperatorsCTASection } from "@marketing/components/home/content/Product/HomeAIOperatorsCTASection";
import { HomeQuotesSection } from "@marketing/components/home/content/Product/HomeQuotesSection";
import { InteractiveFeaturesSection } from "@marketing/components/home/content/Product/InteractiveFeaturesSection";
import { ProductIntroSection } from "@marketing/components/home/content/Product/ProductIntroSection";
import { SecurityFeaturesSection } from "@marketing/components/home/content/Product/SecurityFeaturesSection";
import { HomeTeamUsageSection } from "@marketing/components/home/content/Product/HomeTeamUsageSection";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

const TESTIMONIAL_IMAGE = "/static/landing/people/quote-testimonial.png";

// Same testimonial carousel as the homepage (IntroSection).
const QUOTES = [
  {
    quote:
      "Dust is the most impactful software we've adopted since building Clay.",
    authorName: "Everett Berry",
    authorRole: "Head of GTM Engineering at Clay",
    imageSrc: TESTIMONIAL_IMAGE,
    imageAlt: "Everett Berry, Head of GTM Engineering at Clay",
  },
  {
    quote: "We used to do the work. Now we build the agents that do it.",
    authorName: "Shashank Khanna",
    authorRole: "Founder in Residence of GTM Innovation at Vanta",
    imageSrc: "/static/landing/people/shashank-khanna.png",
    imageAlt: "Shashank Khanna, Founder in Residence at Vanta",
    bg: "bg-violet-50",
  },
];

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
        title="Dust Product: AI Agents That Know Your Company"
        description="Discover how Dust AI agents access your company knowledge, integrate with your tools, and help teams work smarter. Secure, customizable, and enterprise-ready."
        pathname={router.asPath}
      />
      {/* Single section child: keeps the LandingLayout container gap from
          stacking between every block (same structure as the homepage). */}
      <section className="w-full">
        <div className="flex flex-col">
          <ProductIntroSection />
          <CapabilitySection />
          <InteractiveFeaturesSection />
          <SecurityFeaturesSection />
          <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] flex w-screen flex-col">
            <HomeQuotesSection quotes={QUOTES} />
            <HomeTeamUsageSection />
            <HomeAIOperatorsCTASection />
          </div>
        </div>
      </section>
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
