import { CapabilitySection } from "@marketing/components/home/content/Product/CapabilitySection";
import { InteractiveFeaturesSection } from "@marketing/components/home/content/Product/InteractiveFeaturesSection";
import { ProductIntroSection } from "@marketing/components/home/content/Product/ProductIntroSection";
import { ProductVideoSection } from "@marketing/components/home/content/Product/ProductVideoSection";
import { SecurityFeaturesSection } from "@marketing/components/home/content/Product/SecurityFeaturesSection";
import type { SecurityFeature } from "@marketing/components/home/content/Product/SecurityFeaturesSection";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

const CAPABILITY_FEATURES: SecurityFeature[] = [
  {
    id: "org-intelligence",
    title: "Organizational intelligence",
    description:
      "Put a deep understanding of how your company works into action",
    placeholder: "",
  },
  {
    id: "collaboration",
    title: "Human-agent collaboration",
    description: "Orchestrate complex work across humans and agents",
    placeholder: "",
  },
  {
    id: "activation",
    title: "AI-native activation",
    description: "Activate reusable AI building blocks that compound with use",
    placeholder: "",
  },
];

const MODEL_FEATURES: SecurityFeature[] = [
  {
    id: "flexibility",
    title: "Model flexibility",
    description: "Power workflows with any frontier or open-source model.",
    placeholder: "",
  },
  {
    id: "cost",
    title: "Token costs",
    description: "Optimize model usage for efficiency and performance.",
    placeholder: "",
  },
  {
    id: "sovereignty",
    title: "Sovereignty",
    description:
      "Protect your organization's intelligence from vendor and geopolitical risk.",
    placeholder: "",
  },
];

const GOVERN_FEATURES: SecurityFeature[] = [
  {
    id: "security",
    title: "Security",
    description:
      "Control access to data, tools, and systems across digital workforces of humans and agents.",
    placeholder: "",
  },
  {
    id: "observability",
    title: "Observability",
    description:
      "Track and manage AI usage and adoption across the organization.",
    placeholder: "",
  },
  {
    id: "cost-control",
    title: "Cost control",
    description: "Measure ROI, forecast consumption, and manage AI costs.",
    placeholder: "",
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
          <ProductVideoSection />
          <CapabilitySection />
          <SecurityFeaturesSection
            showHeader={false}
            reverse
            features={CAPABILITY_FEATURES}
            accordionTitle="Multiplayer AI"
          />
          <SecurityFeaturesSection
            showHeader={false}
            features={MODEL_FEATURES}
            videoSrc="/static/landing/home/features/best-model.mp4"
            accordionTitle="Multi-model"
          />
          <SecurityFeaturesSection
            showHeader={false}
            reverse
            features={GOVERN_FEATURES}
            imageSrc="/static/landing/product/govern-ai-usage.svg"
            accordionTitle="AI-native governance"
          />
          <InteractiveFeaturesSection />
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
