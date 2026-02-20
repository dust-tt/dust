// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { QuoteSection } from "@app/components/home/ContentBlocks";
import { H1, H2, H3, P } from "@app/components/home/ContentComponents";
import { TestimonialSection } from "@app/components/home/content/Product/TestimonialSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";
import UTMButton from "@app/components/UTMButton";
import { classNames } from "@app/lib/utils";
import { ChevronDownIcon, ChevronUpIcon, RocketIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import { useRouter } from "next/router";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <div
      className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen pb-12"
      style={{
        background:
          "linear-gradient(180deg, #FFF 0%, #E9F7FF 40%, #E9F7FF 60%, #FFF 100%)",
      }}
    >
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 pt-24 text-center sm:px-6">
        <h1 className="heading-mono-5xl font-mono md:heading-mono-6xl lg:heading-mono-8xl py-2 text-center">
          Enterprise <span className="text-brand-electric-blue">AI agents</span>
          <br />
          that understand your
          <br />
          company like you do
        </h1>
        <P
          size="lg"
          className="text-xl leading-7 tracking-tight text-muted-foreground"
        >
          AI agents that plug into your tools, learn your company inside out,
          <br />
          and take boring work off your team's plate.
          <br />
          Accurate and wildly connected.
        </P>
        <div className="mt-4 flex flex-col gap-4 xs:flex-row sm:flex-row md:flex-row">
          <UTMButton
            variant="highlight"
            size="md"
            label="Get started"
            href="/pricing"
            icon={RocketIcon}
            className="w-full xs:w-auto sm:w-auto md:w-auto"
          />
          <UTMButton
            href="/home/contact"
            variant="outline"
            size="md"
            label="Talk to us"
            className="w-full xs:w-auto sm:w-auto md:w-auto"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 Value Prop Cards
// ---------------------------------------------------------------------------

function ValuePropsSection() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Card 1: Accuracy */}
      <div className="flex flex-col overflow-hidden rounded-2xl">
        <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-blue-100 p-8">
          <Image
            src="/static/landing/enterprise/section1/accuracy.png"
            alt="Accuracy and quality"
            width={300}
            height={200}
            className="h-auto max-h-full w-auto"
          />
        </div>
        <div className="flex flex-col gap-3 py-6">
          <H3 className="text-foreground" mono>
            Accuracy and quality you trust to act on
          </H3>
          <P size="md" className="text-muted-foreground">
            We're obsessive about getting it right, so your team doesn't just
            read answers.
          </P>
          <P size="md" className="text-muted-foreground">
            Teams trust Dust to do the work, to the highest degree of quality,
            with multi-model access.
          </P>
        </div>
      </div>

      {/* Card 2: Agents wired together */}
      <div className="flex flex-col overflow-hidden rounded-2xl">
        <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-yellow-100 p-8">
          <Image
            src="/static/landing/enterprise/section1/human_agents_tools.png"
            alt="Humans, agents, and tools wired together"
            width={300}
            height={200}
            className="h-auto max-h-full w-auto"
          />
        </div>
        <div className="flex flex-col gap-3 py-6">
          <H3 className="text-foreground" mono>
            Humans, agents, tools, all wired together
          </H3>
          <P size="md" className="text-muted-foreground">
            Your team builds agents. Those agents talk to your tools. And to
            each other.
          </P>
          <P size="md" className="text-muted-foreground">
            And back to your team. Sales builds something useful, Support's
            already using it by Tuesday. Knowledge compounds, everyone gets
            faster.
          </P>
        </div>
      </div>

      {/* Card 3: Enterprise-ready */}
      <div className="flex flex-col overflow-hidden rounded-2xl">
        <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-pink-100 p-8">
          <div className="flex items-center gap-4">
            <Image
              src="/static/landing/security/soc2.svg"
              alt="SOC 2 Type II"
              width={80}
              height={80}
              className="h-20 w-auto"
            />
            <Image
              src="/static/landing/security/gdpr.svg"
              alt="GDPR"
              width={80}
              height={80}
              className="h-20 w-auto"
            />
            <Image
              src="/static/landing/security/hipaa.svg"
              alt="HIPAA"
              width={80}
              height={80}
              className="h-20 w-auto"
            />
          </div>
        </div>
        <div className="flex flex-col gap-3 py-6">
          <H3 className="text-foreground" mono>
            Enterprise-ready, obviously
          </H3>
          <P size="md" className="text-muted-foreground">
            Yes, it's secure. Yes, it's fast. All the table stakes, cleared. SOC
            2 Type II. SSO. SCIM. Role-based permissions. Zero model training on
            your data.
          </P>
          <P size="md" className="text-muted-foreground">
            Audit logs. All the things you're about to ask about.
          </P>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trust Statement
// ---------------------------------------------------------------------------

function TrustStatementSection() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-blue-50 py-12 md:py-16 lg:py-20">
      {/* Decorative shapes */}
      <div className="absolute left-0 top-0 h-32 w-32 -translate-x-1/4 -translate-y-1/4 rounded-br-full bg-red-400" />
      <div className="absolute right-0 top-0 h-32 w-32 translate-x-1/4 -translate-y-1/4 rounded-bl-full bg-blue-400" />
      <div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-1/4 translate-y-1/4 rounded-tr-full bg-green-400" />
      <div className="absolute bottom-0 right-0 h-32 w-32 translate-x-1/4 translate-y-1/4 rounded-tl-full bg-pink-300" />

      <div className="container mx-auto max-w-4xl px-6 lg:px-8">
        <div className="relative flex flex-col items-center justify-center py-8 text-center md:py-12">
          <H2 className="mb-8 text-3xl font-medium text-blue-600 md:text-4xl xl:text-5xl">
            You can't save time with agents you don't trust
          </H2>
          <P size="md" className="text-center text-muted-foreground">
            <strong className="font-semibold text-foreground">
              Dust is built to do things
            </strong>
            , not just find things.
          </P>
          <P size="md" className="mt-4 text-center text-muted-foreground">
            Update the CRM. Draft the report. Kick off the workflow.
            <br />
            But none of that matters if you're double-checking every output.
            <br />
            We made accuracy the foundation so that every connection, every
            agent, every piece
            <br />
            of the product is built on that
          </P>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "What this means in practice" — Accordion + Image
// ---------------------------------------------------------------------------

interface AccordionItemData {
  title: string;
  content: ReactNode;
  image: string;
  imageAlt: string;
  imageBg: string;
}

const ACCORDION_ITEMS: AccordionItemData[] = [
  {
    title: "Plays nicely with everyone",
    content: (
      <div className="flex flex-col gap-4">
        <P
          size="md"
          dotCSS="text-brand-orange-golden"
          shape="circle"
          className="text-muted-foreground"
        >
          Switch between best-in-class models OpenAI, Anthropic, Google,
          Mistral, etc.
        </P>
        <P
          size="md"
          dotCSS="text-brand-red-rose"
          shape="rectangle"
          className="text-muted-foreground"
        >
          No vendor lock-in: use all your company data ecosystem through our
          Connections, MCP servers, or Open API. Redeploy agents to different
          models without rewriting logic
        </P>
        <P
          size="md"
          dotCSS="text-brand-hunter-green"
          shape="hexagon"
          className="text-muted-foreground"
        >
          Future-proof against model market shifts
        </P>
      </div>
    ),
    image: "/static/landing/enterprise/section2/plays_nicely.png",
    imageAlt: "Model selection showing gpt5, Claude, Mistral, Gemini",
    imageBg: "bg-pink-100",
  },
  {
    title: "Customize to the MAX",
    content: (
      <div className="flex flex-col gap-4">
        <P
          size="md"
          dotCSS="text-brand-orange-golden"
          shape="circle"
          className="text-muted-foreground"
        >
          Build agents tailored to your team's exact workflows and terminology
        </P>
        <P
          size="md"
          dotCSS="text-brand-red-rose"
          shape="rectangle"
          className="text-muted-foreground"
        >
          Connect to any internal tool or data source with Connections, MCP
          servers, or the API
        </P>
        <P
          size="md"
          dotCSS="text-brand-hunter-green"
          shape="hexagon"
          className="text-muted-foreground"
        >
          Fine-tune agent behavior with instructions, tools, and knowledge
          sources
        </P>
      </div>
    ),
    image: "/static/landing/enterprise/section2/customize.png",
    imageAlt: "Customization options",
    imageBg: "bg-blue-100",
  },
  {
    title: "Your security team will be thrilled",
    content: (
      <div className="flex flex-col gap-4">
        <P
          size="md"
          dotCSS="text-brand-orange-golden"
          shape="circle"
          className="text-muted-foreground"
        >
          SOC 2 Type II certified, GDPR compliant, enables HIPAA compliance
        </P>
        <P
          size="md"
          dotCSS="text-brand-red-rose"
          shape="rectangle"
          className="text-muted-foreground"
        >
          SSO, SCIM, role-based permissions, and audit logs out of the box
        </P>
        <P
          size="md"
          dotCSS="text-brand-hunter-green"
          shape="hexagon"
          className="text-muted-foreground"
        >
          Zero model training on your data. Encryption at rest and in transit
        </P>
      </div>
    ),
    image: "/static/landing/enterprise/section2/security_permissions.png",
    imageAlt: "Security certifications",
    imageBg: "bg-green-100",
  },
];

function WhatThisMeansSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="w-full">
      <H1 mono className="mb-12 text-center text-3xl md:text-4xl lg:text-5xl">
        What this means in practice...
      </H1>
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        {/* Left: Accordion */}
        <div className="flex-1">
          <div className="w-full">
            {ACCORDION_ITEMS.map((item, index) => (
              <div key={index} className="border-b border-gray-200">
                <button
                  className="flex w-full items-center justify-between py-6 text-left focus:outline-none"
                  onClick={() => setOpenIndex(openIndex === index ? -1 : index)}
                  aria-expanded={openIndex === index}
                >
                  <span className="text-lg font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="ml-6 flex h-6 w-6 flex-shrink-0 items-center justify-center text-muted-foreground">
                    {openIndex === index ? (
                      <ChevronUpIcon className="h-5 w-5" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5" />
                    )}
                  </span>
                </button>
                <div
                  className={classNames(
                    "grid overflow-hidden transition-all duration-300 ease-in-out",
                    openIndex === index
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="pb-6">{item.content}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Image */}
        <div className="flex flex-1 items-center justify-center">
          <div
            className={classNames(
              "flex aspect-square w-full max-w-md items-center justify-center rounded-2xl p-8",
              openIndex >= 0
                ? ACCORDION_ITEMS[openIndex].imageBg
                : "bg-pink-100"
            )}
          >
            <Image
              src={
                openIndex >= 0
                  ? ACCORDION_ITEMS[openIndex].image
                  : ACCORDION_ITEMS[0].image
              }
              alt={
                openIndex >= 0
                  ? ACCORDION_ITEMS[openIndex].imageAlt
                  : ACCORDION_ITEMS[0].imageAlt
              }
              width={400}
              height={400}
              className="h-auto max-h-full w-auto"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "Fully connected and always compounding" — 2x2 Feature Grid
// ---------------------------------------------------------------------------

const FEATURE_CARDS = [
  {
    title: "Knows your company",
    content:
      "Connects to all your tools and data. Notion, Slack, Salesforce, GitHub—everywhere your knowledge lives",
    video: "/static/landing/enterprise/videos/FEATURE 1_Knows your company.mp4",
  },
  {
    title: "AI is a team sport",
    content:
      "Built for collaboration. Your team creates agents, shares them across departments, and everyone gets faster together",
    video: "/static/landing/enterprise/videos/FEATURE 2_AI is a team sport.mp4",
  },
  {
    title: "Always the best model",
    content:
      "Switch between OpenAI, Anthropic, Google, and Mistral. No vendor lock-in, always the right model for the job",
    video:
      "/static/landing/enterprise/videos/FEATURE 3_Always the best model.mp4",
  },
  {
    title: "Compounds across the org",
    content:
      "Value grows with every team that joins. Knowledge multiplies, workflows connect, everyone moves faster.",
    video:
      "/static/landing/enterprise/videos/FEATURE 4_Compoud across the org.mp4",
  },
];

function FullyConnectedSection() {
  return (
    <section className="w-full">
      <H1 mono className="mb-12 text-center text-3xl md:text-4xl lg:text-5xl">
        Fully connected
        <br />
        and always compounding
      </H1>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {FEATURE_CARDS.map((card, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 overflow-hidden rounded-2xl bg-muted-background"
          >
            <div className="flex aspect-video w-full items-center justify-center bg-white p-4">
              <video
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full rounded-lg object-contain"
              >
                <source src={card.video} type="video/mp4" />
              </video>
            </div>
            <div className="flex flex-col gap-3 px-6 pb-6 pt-4">
              <H3 className="text-foreground" mono>
                {card.title}
              </H3>
              <P size="md" className="text-muted-foreground">
                {card.content}
              </P>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Enterprise() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Dust for Enterprise - AI Agents That Understand Your Company"
        description="Enterprise AI agents that plug into your tools, learn your company inside out, and take boring work off your team's plate. Accurate and wildly connected."
        pathname={router.asPath}
      />
      <HeroSection />
      <div className="mt-16 flex flex-col gap-16 md:gap-20 lg:gap-24">
        <ValuePropsSection />
        <TrustStatementSection />
        <WhatThisMeansSection />
        <TestimonialSection
          quote="Before Dust, if we wanted to do that, we had to build the infrastructure ourselves. It saves them from creating the infrastructure behind it."
          author={{
            name: "Nicolas C.",
            title: "Partner, NextStage",
          }}
          company={{
            logo: "/static/landing/logos/color/nextstage.png",
            alt: "NextStage",
          }}
          bgColor="bg-white"
          textColor="text-foreground"
        />
        <FullyConnectedSection />
        <QuoteSection
          quote="Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter and more valuable over time"
          name="Everett Berry"
          title="Head of GTM Engineering at Clay"
          logo="/static/landing/logos/color/clay.png"
        />
        <TrustedBy logoSet="landing" />
      </div>
    </>
  );
}

Enterprise.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
