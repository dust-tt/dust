// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H1, H2, H3, P } from "@app/components/home/ContentComponents";
import { TestimonialSection } from "@app/components/home/content/Product/TestimonialSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";
import UTMButton from "@app/components/UTMButton";
import { classNames } from "@app/lib/utils";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DustLogo,
  RocketIcon,
} from "@dust-tt/sparkle";
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
      <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2">
        {FEATURE_CARDS.map((card, index) => (
          <div key={index} className="flex flex-col">
            <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-blue-50 p-4">
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
            <div className="flex flex-col gap-2 pt-6">
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
// "Your best people want to do their best work"
// ---------------------------------------------------------------------------

function BestPeopleSection() {
  return (
    <section className="rounded-2xl border border-gray-200 p-8 md:p-12">
      <H1 mono className="mb-12 text-center text-3xl md:text-4xl lg:text-5xl">
        Your best people want
        <br />
        to do their best work
      </H1>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="flex flex-col">
          <div className="overflow-hidden rounded-2xl">
            <Image
              src="/static/landing/enterprise/section4/data_analyst.png"
              alt="Data Analyst"
              width={600}
              height={400}
              className="h-auto w-full object-cover"
            />
          </div>
          <div className="flex flex-col gap-3 py-6">
            <H3 className="text-foreground" mono>
              For Data Analyst
            </H3>
            <P size="md" className="text-muted-foreground">
              There's a version of your data analyst's job where she spends her
              day finding patterns that change how you make decisions. Instead,
              she's writing SQL and formatting spreadsheets.
            </P>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="overflow-hidden rounded-2xl">
            <Image
              src="/static/landing/enterprise/section4/ops_lead.png"
              alt="Ops Lead"
              width={600}
              height={400}
              className="h-auto w-full object-cover"
            />
          </div>
          <div className="flex flex-col gap-3 py-6">
            <H3 className="text-foreground" mono>
              For Ops Lead
            </H3>
            <P size="md" className="text-muted-foreground">
              There's a version of your ops lead's job where he's designing
              systems that make everyone faster. Instead, he's copying data from
              one tool to another.
            </P>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-blue-200 bg-blue-50 px-6 py-4">
        <Image
          src="/static/landing/enterprise/section1/accuracy.png"
          alt="Dust"
          width={48}
          height={48}
          className="h-12 w-12 flex-shrink-0"
        />
        <P size="md" className="font-medium text-foreground">
          Dust takes the busywork. The tedious, repetitive, soul-numbing parts,
          so your team can do the work they thrive on.
        </P>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "It's not just humans talking to humans anymore"
// ---------------------------------------------------------------------------

function HumansTalkingSection() {
  return (
    <section className="w-full">
      <H1 mono className="mb-12 text-center text-3xl md:text-4xl lg:text-5xl">
        It's not just humans
        <br />
        talking to humans anymore
      </H1>
      <div className="mx-auto max-w-2xl">
        <Image
          src="/static/landing/enterprise/section3/coordinate.png"
          alt="Delegate, Coordinate, Chain & automate, Surface Insight"
          width={800}
          height={600}
          className="h-auto w-full"
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "How every team uses Dust" — Tabbed Section
// ---------------------------------------------------------------------------

interface TeamTab {
  label: string;
  title: string;
  image: string;
  features: {
    title: string;
    description: string;
    dotColor: string;
    shape: "circle" | "square" | "triangle" | "hexagon" | "rectangle";
  }[];
}

const TEAM_TABS: TeamTab[] = [
  {
    label: "Engineering",
    title: "Engineering Operations",
    image: "/static/landing/enterprise/section5/Engineering.png",
    features: [
      {
        title: "AI-Powered Code Debugging",
        description:
          "Surface relevant context, docs, and historical issues inside your IDE",
        dotColor: "text-pink-300",
        shape: "circle",
      },
      {
        title: "Automated Code Reviews",
        description: "Maintain standards and compliance at scale",
        dotColor: "text-brand-red-rose",
        shape: "rectangle",
      },
      {
        title: "Incident Response",
        description:
          "Execute automated runbooks, integrate communications, and enable rapid root cause analysis",
        dotColor: "text-brand-orange-golden",
        shape: "triangle",
      },
      {
        title: "Continuous Doc Generation",
        description:
          "Keep user and API docs up-to-date from code changes automatically",
        dotColor: "text-brand-hunter-green",
        shape: "hexagon",
      },
    ],
  },
  {
    label: "Customer Support",
    title: "Customer Support Operations",
    image: "/static/landing/enterprise/section5/Engineering.png",
    features: [
      {
        title: "Instant Ticket Resolution",
        description:
          "Connect agents to knowledge base for accurate, instant responses",
        dotColor: "text-pink-300",
        shape: "circle",
      },
      {
        title: "Ticket Classification",
        description:
          "Auto-route tickets based on queries, urgency, and expertise",
        dotColor: "text-brand-red-rose",
        shape: "rectangle",
      },
      {
        title: "Pattern Detection",
        description: "Identify product improvements from ticket patterns",
        dotColor: "text-brand-orange-golden",
        shape: "triangle",
      },
      {
        title: "FAQ Generation",
        description: "Auto-create and update FAQs from resolved tickets",
        dotColor: "text-brand-hunter-green",
        shape: "hexagon",
      },
    ],
  },
  {
    label: "Sales",
    title: "Sales Operations",
    image: "/static/landing/enterprise/section5/Engineering.png",
    features: [
      {
        title: "Account Snapshots",
        description:
          "Create account snapshots from past interactions and CRM data",
        dotColor: "text-pink-300",
        shape: "circle",
      },
      {
        title: "Targeted Outreach",
        description:
          "Generate targeted outreach using call transcripts and insights",
        dotColor: "text-brand-red-rose",
        shape: "rectangle",
      },
      {
        title: "RFP & Prospect Questions",
        description:
          "Answer prospect questions and RFPs with product and competitor insights",
        dotColor: "text-brand-orange-golden",
        shape: "triangle",
      },
      {
        title: "Call Analysis",
        description:
          "Analyze calls to improve pitch delivery and objection handling",
        dotColor: "text-brand-hunter-green",
        shape: "hexagon",
      },
    ],
  },
  {
    label: "Marketing & Content",
    title: "Marketing Operations",
    image: "/static/landing/enterprise/section5/Engineering.png",
    features: [
      {
        title: "On-Brand Content",
        description: "Write on-brand content in minutes",
        dotColor: "text-pink-300",
        shape: "circle",
      },
      {
        title: "Launch Messaging",
        description: "Create consistent launch messaging across channels",
        dotColor: "text-brand-red-rose",
        shape: "rectangle",
      },
      {
        title: "Translation",
        description: "Translate while maintaining brand voice",
        dotColor: "text-brand-orange-golden",
        shape: "triangle",
      },
      {
        title: "Feedback Insights",
        description: "Extract actionable insights from customer feedback",
        dotColor: "text-brand-hunter-green",
        shape: "hexagon",
      },
    ],
  },
  {
    label: "Data & analytics",
    title: "Data & Analytics Operations",
    image: "/static/landing/enterprise/section5/Engineering.png",
    features: [
      {
        title: "Natural Language Queries",
        description: "Enable non-technical teams to query company data",
        dotColor: "text-pink-300",
        shape: "circle",
      },
      {
        title: "Automated Reporting",
        description: "Automate reporting from all data types",
        dotColor: "text-brand-red-rose",
        shape: "rectangle",
      },
      {
        title: "Visual Storytelling",
        description: "Transform insights into visual stories",
        dotColor: "text-brand-orange-golden",
        shape: "triangle",
      },
      {
        title: "Unified Analysis",
        description: "Connect multiple data sources for unified analysis",
        dotColor: "text-brand-hunter-green",
        shape: "hexagon",
      },
    ],
  },
];

function HowTeamsUseSection() {
  const [activeTab, setActiveTab] = useState(0);
  const tab = TEAM_TABS[activeTab];

  return (
    <section className="w-full">
      <div className="mb-8 flex flex-col items-center gap-2">
        <H1 mono className="text-center text-3xl md:text-4xl lg:text-5xl">
          How every team uses
        </H1>
        <DustLogo className="h-8 w-32" />
      </div>

      {/* Tabs */}
      <div className="mb-8 border-b border-gray-200">
        <div className="flex gap-8 overflow-x-auto">
          {TEAM_TABS.map((t, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              className={classNames(
                "whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors",
                activeTab === index
                  ? "border-blue-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        <div className="flex-1">
          <div className="overflow-hidden rounded-2xl bg-gray-100">
            <Image
              src={tab.image}
              alt={tab.title}
              width={600}
              height={500}
              className="h-auto w-full"
            />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <H2 className="mb-8">{tab.title}</H2>
          <div className="flex flex-col gap-6">
            {tab.features.map((feature, index) => (
              <div key={index}>
                <P
                  size="md"
                  dotCSS={feature.dotColor}
                  shape={feature.shape}
                  className="text-foreground"
                >
                  <strong className="font-semibold">{feature.title}</strong>
                  <br />
                  <span className="text-muted-foreground">
                    {feature.description}
                  </span>
                </P>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "Enterprise-grade, no asterisks*"
// ---------------------------------------------------------------------------

function EnterpriseGradeSection() {
  return (
    <section className="w-full">
      <H1 mono className="mb-4 text-center text-3xl md:text-4xl lg:text-5xl">
        Enterprise-grade, no asterisks*
      </H1>
      <P size="md" className="mb-12 text-center text-muted-foreground">
        When AI has access to your company's knowledge,
        <br />
        "mostly secure" doesn't cut it. At least not for us.
      </P>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Security & compliance */}
        <div className="rounded-2xl bg-gray-50 p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center">
            <img
              src="/static/landing/industry/d-blue.svg"
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
          <H3 className="mb-6">Security & compliance</H3>
          <div className="mb-6 flex gap-4">
            <img
              src="/static/landing/security/soc2.svg"
              className="h-12"
              alt="SOC 2 Type II"
            />
            <img
              src="/static/landing/security/gdpr.svg"
              className="h-12"
              alt="GDPR"
            />
            <img
              src="/static/landing/security/hipaa.svg"
              className="h-12"
              alt="HIPAA"
            />
          </div>
          <div className="flex flex-col gap-2">
            <P size="sm" className="text-muted-foreground">
              SSO (SAML, OIDC) · Audit logs (365-day retention)
            </P>
            <P size="sm" className="text-muted-foreground">
              Role-based access control (RBAC)
            </P>
            <P size="sm" className="text-muted-foreground">
              Data encryption at rest (AES-256) + in transit (TLS 1.3)
            </P>
          </div>
        </div>

        {/* Performance & scale */}
        <div className="rounded-2xl bg-pink-50 p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center">
            <img
              src="/static/landing/industry/d-red.svg"
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
          <H3 className="mb-6">Performance & scale</H3>
          <div className="flex flex-col gap-2">
            <P size="sm" className="text-muted-foreground">
              99.9% uptime SLA
            </P>
            <P size="sm" className="text-muted-foreground">
              Supports 10,000+ users per workspace
            </P>
            <P size="sm" className="text-muted-foreground">
              Concurrent agent execution (no queuing)
            </P>
            <P size="sm" className="text-muted-foreground">
              CDN-backed global deployment
            </P>
            <P size="sm" className="text-muted-foreground">
              Rate limiting per workspace tier
            </P>
          </div>
        </div>

        {/* White-glove support */}
        <div className="rounded-2xl bg-gray-50 p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center">
            <img
              src="/static/landing/industry/d-red.svg"
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
          <H3 className="mb-6">White-glove support</H3>
          <div className="flex flex-col gap-2">
            <P size="sm" className="text-muted-foreground">
              We build AGI at work with you: Share what you love, what you
              build, and push Dust to become a better and more valuable product
            </P>
            <P size="sm" className="text-muted-foreground">
              Hand-glove support to accelerate your AI transformation
            </P>
          </div>
        </div>

        {/* Integration architecture */}
        <div className="rounded-2xl bg-green-50 p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center">
            <img
              src="/static/landing/industry/d-green.svg"
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
          <H3 className="mb-6">Integration architecture</H3>
          <div className="flex flex-col gap-2">
            <P size="sm" className="text-muted-foreground">
              RESTful API for custom integrations
            </P>
            <P size="sm" className="text-muted-foreground">
              Webhook support for event-driven workflows
            </P>
            <P size="sm" className="text-muted-foreground">
              MCP (Model Context Protocol) for proprietary systems
            </P>
            <P size="sm" className="text-muted-foreground">
              OAuth2 for third-party app permissions
            </P>
            <P size="sm" className="text-muted-foreground">
              Bi-directional sync (read + write actions)
            </P>
            <P size="sm" className="text-muted-foreground">
              Incremental data refresh (not full re-index)
            </P>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "Don't take our word for it" — Mosaic
// ---------------------------------------------------------------------------

interface MosaicMetricCardProps {
  value: string;
  description: string;
  logo: string;
  logoAlt: string;
  bgColor: string;
  textColor: string;
  quote?: string;
  divider?: boolean;
  className?: string;
}

function MosaicMetricCard({
  value,
  description,
  logo,
  logoAlt,
  bgColor,
  textColor,
  quote,
  divider,
  className = "",
}: MosaicMetricCardProps) {
  return (
    <div
      className={classNames(
        "flex flex-col justify-between rounded-2xl p-6",
        bgColor,
        className
      )}
    >
      <div>
        <p className={classNames("text-4xl font-medium", textColor)}>{value}</p>
        {divider && <div className="mt-3 border-t border-current opacity-20" />}
        <p
          className={classNames(
            "mt-2 font-mono text-sm font-medium",
            textColor
          )}
        >
          {description}
        </p>
        {quote && (
          <P size="xs" className="mt-3 text-muted-foreground">
            "{quote}"
          </P>
        )}
      </div>
      {logo && (
        <img src={logo} alt={logoAlt} className="mt-4 h-20 w-auto self-start" />
      )}
    </div>
  );
}

interface MosaicQuoteCardProps {
  quote: string;
  logo: string;
  logoAlt: string;
  image?: string;
  imageAlt?: string;
  bgColor: string;
  className?: string;
}

function MosaicQuoteCard({
  quote,
  logo,
  logoAlt,
  image,
  imageAlt,
  bgColor,
  className = "",
}: MosaicQuoteCardProps) {
  return (
    <div
      className={classNames(
        "flex flex-col overflow-hidden rounded-2xl",
        bgColor,
        className
      )}
    >
      {image && (
        <div className="aspect-[4/3] w-full overflow-hidden">
          <img
            src={image}
            alt={imageAlt ?? ""}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col justify-between p-6">
        <P size="sm" className="text-foreground">
          "{quote}"
        </P>
        <img src={logo} alt={logoAlt} className="mt-4 h-20 w-auto self-start" />
      </div>
    </div>
  );
}

function SocialProofMosaicSection() {
  return (
    <section className="w-full">
      <H1 mono className="mb-12 text-left text-3xl md:text-4xl lg:text-5xl">
        Don't take our word for it
      </H1>
      <div className="grid auto-rows-auto grid-cols-1 gap-4 md:grid-cols-3">
        {/* Column 1 */}
        <div className="flex flex-col gap-4">
          <MosaicMetricCard
            value="100%"
            description="of customer experience team uses Dust daily"
            logo="/static/landing/logos/color/malt.png"
            logoAlt="Malt"
            bgColor="bg-amber-50"
            textColor="text-amber-800"
          />
          <div className="flex items-center gap-3 rounded-2xl bg-golden-50 px-6 py-4">
            <span className="text-3xl font-medium text-golden-600">95%</span>
            <div className="h-8 w-px bg-golden-300" />
            <span className="font-mono text-sm font-medium text-golden-600">
              Adoption
            </span>
          </div>
          <MosaicQuoteCard
            quote="Dust has made it possible empowering our employees to work smarter"
            logo="/static/landing/logos/color/doctolib.png"
            logoAlt="Doctolib"
            image="/static/landing/enterprise/section6/doctolib.jpg"
            bgColor="bg-white"
          />
        </div>

        {/* Column 2 */}
        <div className="flex flex-col gap-4">
          <MosaicMetricCard
            value="x4"
            description="Support tickets cut"
            logo=""
            logoAlt=""
            bgColor="bg-blue-50"
            textColor="text-blue-800"
            divider
          />
          <MosaicMetricCard
            value="+50k"
            description="Hours saved annually"
            quote="Dust AI assistants can remove tens of thousands of hours of work each year"
            logo="/static/landing/logos/color/qonto.png"
            logoAlt="Qonto"
            bgColor="bg-white"
            textColor="text-foreground"
            className="border border-gray-100"
          />
          <MosaicMetricCard
            value="70%"
            description="reduction in translation bottleneck"
            logo="/static/landing/logos/color/fleet.png"
            logoAlt="Fleet"
            bgColor="bg-lime-50"
            textColor="text-green-700"
          />
        </div>

        {/* Column 3 */}
        <div className="flex flex-col gap-4">
          <MosaicQuoteCard
            quote="Dust is the most impactful software we've adopted since building Clay"
            logo="/static/landing/logos/color/clay.png"
            logoAlt="Clay"
            image="/static/landing/enterprise/section6/clay.webp"
            bgColor="bg-white"
          />
          <MosaicMetricCard
            value="50%"
            description="faster legal task completion"
            logo="/static/landing/logos/color/payfit.png"
            logoAlt="PayFit"
            bgColor="bg-golden-50"
            textColor="text-golden-600"
          />
          <MosaicMetricCard
            value="84%"
            description="Weekly Active Users"
            logo="/static/landing/logos/color/alan.png"
            logoAlt="Alan"
            bgColor="bg-blue-100"
            textColor="text-blue-800"
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "Ready to move faster?" — Bottom CTA
// ---------------------------------------------------------------------------

function ReadyToMoveSection() {
  return (
    <div
      className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen py-16 md:py-24"
      style={{
        background:
          "linear-gradient(180deg, #E9F7FF 0%, #E9F7FF 80%, #FFF 100%)",
      }}
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <H1 mono className="mb-12 text-center text-3xl md:text-4xl lg:text-5xl">
          Ready to move faster?
        </H1>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="flex flex-col justify-between rounded-2xl bg-white p-8 shadow-sm">
            <div>
              <H3 className="mb-4 text-foreground" mono>
                For Technical Buyers
              </H3>
              <P size="md" className="text-muted-foreground">
                45-minute session with our Solutions Engineering team. We'll
                review your stack, map integration requirements, and design your
                deployment architecture.
              </P>
            </div>
            <div className="mt-8">
              <UTMButton
                variant="highlight"
                size="md"
                label="Contact us"
                href="/home/contact"
                className="w-full"
              />
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-2xl bg-white p-8 shadow-sm">
            <div>
              <H3 className="mb-4 text-foreground" mono>
                For Business Buyers
              </H3>
              <P size="md" className="text-muted-foreground">
                Model your cost savings from stack consolidation + productivity
                gains. Compare against ChatGPT Enterprise, Copilot, and
                build-it-yourself scenarios
              </P>
            </div>
            <div className="mt-8">
              <UTMButton
                variant="outline"
                size="md"
                label="Contact us"
                href="/home/contact"
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
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
        <BestPeopleSection />
        <HumansTalkingSection />
        <HowTeamsUseSection />
        <EnterpriseGradeSection />
        <SocialProofMosaicSection />
        <TrustedBy logoSet="landing" />
      </div>
      <ReadyToMoveSection />
    </>
  );
}

Enterprise.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
