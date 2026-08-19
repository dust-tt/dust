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
    title: "Company knowledge, search, and MCPs",
    description:
      "Put a deep understanding of how your company works, through semantic search and 70+ out-of-the-box MCP connectors, into action.",
    placeholder: "",
  },
  {
    id: "collaboration",
    title: "Human-agent collaboration",
    description:
      "Orchestrate complex work across digital teams of people and agents using Pods and Frames, powered by a shared virtual computer and automations.",
    placeholder: "",
  },
  {
    id: "activation",
    title: "Composable workflows that compound with use",
    description:
      "Execute structured and unstructured work using reusable, governable AI skills, agents, and memory that compound with use.",
    placeholder: "",
  },
];

const MODEL_FEATURES: SecurityFeature[] = [
  {
    id: "flexibility",
    title: "Model flexibility without lock-in",
    description:
      "Build custom agents with 20+ frontier and open-source models from OpenAI, Anthropic, Google, Mistral, and more. Choose the right model for each workflow and switch as your needs change.",
    placeholder: "",
  },
  {
    id: "cost",
    title: "Performance with cost visibility",
    description:
      "Credit-based pricing and usage analytics by agent and model show what each workflow costs, helping you balance performance and efficiency with spend.",
    placeholder: "",
  },
  {
    id: "sovereignty",
    title: "AI sovereignty",
    description:
      "Protect your company's data from vendor lock-in and geopolitical risk by controlling where it is processed and which model providers you rely on.",
    placeholder: "",
  },
];

const GOVERN_FEATURES: SecurityFeature[] = [
  {
    id: "security",
    title: "Security and access controls",
    description:
      "Control access to data, tools, and systems across teams of people and agents. Use Spaces and Groups to define permissions, with audit logs to track activity.",
    placeholder: "",
  },
  {
    id: "observability",
    title: "AI observability and analytics",
    description:
      "Track and manage AI usage and adoption across the organization with analytics that show how agents and models are being used over time.",
    placeholder: "",
  },
  {
    id: "cost-control",
    title: "Cost control",
    description:
      "Measure ROI, forecast consumption, and manage AI costs. Use programmatic rate limits to control automated usage and manage a shared credit pool across teams and workflows.",
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
            accordionTitle="Multiplayer AI built for real, cross-functional work"
          />
          <SecurityFeaturesSection
            showHeader={false}
            features={MODEL_FEATURES}
            videoSrc="/static/landing/home/features/best-model.mp4"
            accordionTitle="Use any model, switch any time, and control your data"
          />
          <SecurityFeaturesSection
            showHeader={false}
            reverse
            features={GOVERN_FEATURES}
            imageSrc="/static/landing/product/govern-ai-usage.svg"
            accordionTitle="Govern AI usage and costs across people and agents"
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
