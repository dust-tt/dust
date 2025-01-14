import {
  Div3D,
  Hover3D,
  RocketIcon,
  UserGroupIcon,
  LightbulbIcon,
} from "@dust-tt/sparkle";
import type { ReactElement } from "react-markdown/lib/react-markdown";

import {
  UseCasesSection,
  type UseCase,
} from "@app/components/home/content/Solutions/UseCasesSection";

import {
  CustomerStoriesSection,
  type CustomerStory,
} from "@app/components/home/content/Solutions/CustomerStoriesSection";

import {
  CarousselContentBlock,
  MetricComponent,
  Quote,
} from "@app/components/home/ContentBlocks";
import { Grid, H1, H2, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import type { SolutionSectionAssistantBlockProps } from "@app/components/home/SolutionSection";
import {
  BenefitsSection,
  type Benefit,
} from "@app/components/home/content/Solutions/BenefitsSection";
import TrustedBy from "@app/components/home/TrustedBy";
import { classNames } from "@app/lib/utils";
import { HeroSection } from "@app/components/home/content/Solutions/HeroSection";

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.octahedron),
    },
  };
}

interface pageSettingsProps {
  uptitle: string;
  title: React.ReactNode;
  description: React.ReactNode;
  from: string;
  to: string;
}

const pageSettings: pageSettingsProps = {
  uptitle: "Customer Support",
  title: <>Instant knowledge, exceptional support.</>,
  from: "from-sky-200",
  to: "to-sky-500",
  description: (
    <>
      Equip your&nbsp;team with AI&nbsp;assistants to&nbsp;accelerate issue
      resolution and&nbsp;increase customer satisfaction.
    </>
  ),
};

// Settings for Hero section
const supportHeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  fromColor: pageSettings.from,
  toColor: pageSettings.to,
  visuals: [
    {
      src: "/static/landing/support/support1.png",
      alt: "Support Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/support/support2.png",
      alt: "Support Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/support/support3.png",
      alt: "Support Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/support/support4.png",
      alt: "Support Visual 4",
      depth: 50,
    },
  ],
  ctaButtons: {
    primary: {
      label: "Get started",
      href: "/home/pricing",
      icon: RocketIcon,
    },
    secondary: {
      label: "Talk to sales",
      href: "https://forms.gle/dGaQ1AZuDCbXY1ft9",
      target: "_blank",
    },
  },
};

// Parameters for the Benefits Section
const supportBenefits: Benefit[] = [
  {
    icon: RocketIcon,
    title: "Resolve Issues Faster",
    description:
      "Surface relevant information from all connected knowledge bases instantly and understand messages in 50+ languages.",
  },
  {
    icon: UserGroupIcon,
    title: "Boost Team Productivity",
    description:
      "Keep teams synchronized with real-time access to information across all communication channels and reduce onboarding time.",
  },
  {
    icon: LightbulbIcon,
    title: "Understand Customer Needs",
    description:
      "Gain insights from cross-tool interactions to understand and act on customer needs, improve documentation.",
  },
];

// Parameters for the Use Cases Section
const supportUseCases: UseCase[] = [
  {
    title: "Ticket Resolution",
    content:
      "Accelerate response times with dynamic answer suggestions and contextual knowledge at every step.",
    images: ["/static/landing/solutions/support1.png"],
  },
  {
    title: "Agent Coaching",
    content:
      "Offer feedback to support agents using real-time best practices and ticket insights for consistent, quality service.",
    images: ["/static/landing/solutions/support2.png"],
  },
  {
    title: "Documentation Builder",
    content:
      "Convert resolved tickets into searchable articles and FAQs, capturing best practices for future use.",
    images: ["/static/landing/solutions/support3.png"],
  },
  {
    title: "Customer Insights",
    content:
      "Identify trends from customer feedback, helping teams proactively improve service and satisfaction.",
    images: ["/static/landing/solutions/support4.png"],
  },
];

// Parameters for the Customer Stories Section
const supportStories: CustomerStory[] = [
  {
    title: "Malt cuts support ticket closing time by 50% with Dust",
    content:
      "Malt streamlines customer support using Dust's AI platform for rapid, consistent multilingual responses.",
    href: "https://blog.dust.tt/malt-customer-support/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/12/Malt_Customer_Story_Dust_Support.jpg",
  },
  {
    title: "Pennylane's journey to deploy Dust for Customer Care teams",
    content:
      "Dust evolved from a simple support tool into an integral part of Pennylane's operations.",
    href: "https://blog.dust.tt/pennylane-dust-customer-support-journey/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/12/pennylane_dust_customer_story.png",
  },
  {
    title: "Lifen uses Dust AI assistants to boost team productivity",
    content:
      "Lifen uses Dust AI assistants to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  },
];

export default function CustomerSupport() {
  const MainVisualImage = () => (
    <>
      <Hover3D depth={-40} perspective={1000} className="relative">
        <Div3D depth={-30}>
          <img src="/static/landing/support/support1.png" alt="MainVisual1" />
        </Div3D>
        <Div3D depth={-10} className="absolute top-0">
          <img src="/static/landing/support/support2.png" alt="MainVisual2" />
        </Div3D>
        <Div3D depth={20} className="absolute top-0">
          <img src="/static/landing/support/support3.png" alt="MainVisual3" />
        </Div3D>
        <Div3D depth={50} className="absolute top-0">
          <img src="/static/landing/support/support4.png" alt="MainVisual4" />
        </Div3D>
      </Hover3D>
    </>
  );
  return (
    <>
      <div className="container flex w-full flex-col gap-0 px-6 pb-12">
        <HeroSection {...supportHeroProps} />
        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-8",
              "col-span-12",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <BenefitsSection
              title="Elevate support operations"
              benefits={supportBenefits}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
            <MetricComponent
              metrics={[
                {
                  value: "15x",
                  description: <>15x&nbsp;faster to craft an answer</>,
                },
                {
                  value: "8h",
                  description: (
                    <>
                      Save 8&nbsp;hours per&nbsp;agent per&nbsp;week
                      on&nbsp;average
                    </>
                  ),
                },
              ]}
              from="from-amber-200"
              to="to-amber-500"
            />
          </div>
          <div
            className={classNames(
              "flex flex-col gap-8",
              "col-span-12",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <UseCasesSection
              title="Top use cases"
              useCases={supportUseCases}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
          </div>
          <div
            className={classNames(
              "flex flex-col justify-center gap-8 pb-4",
              "col-span-12",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <div>
              <H2 from={pageSettings.from} to={pageSettings.to}>
                Dust in action
              </H2>
              {/* <P size="lg">See a demo of the Dust product.</P> */}
            </div>
            <Hover3D depth={-40} perspective={1000} className="relative w-full">
              <div className="relative w-full pt-[56.25%]">
                {" "}
                {/* 16:9 aspect ratio */}
                <iframe
                  src="https://fast.wistia.net/embed/iframe/7ynip6mgfx?seo=true&videoFoam=true"
                  title="Dust product tour"
                  allow="autoplay; fullscreen"
                  frameBorder="0"
                  className="absolute inset-0 h-full w-full rounded-lg"
                ></iframe>{" "}
              </div>
            </Hover3D>
          </div>
          <div
            className={classNames(
              "flex flex-col gap-8 pb-12",
              "col-span-12",
              "lg:12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <Quote
              quote="We’re managing a&nbsp;higher volume of&nbsp;tickets and have cut processing time—from an&nbsp;average of 6&nbsp;minutes per ticket to&nbsp;just a&nbsp;few seconds."
              name="Anaïs Ghelfi"
              title="Head of Data Platform at Malt"
              logo="/static/landing/logos/malt.png"
            />
            <CustomerStoriesSection
              title="Customer stories"
              stories={supportStories}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
          </div>
          <TrustedBy />;
        </Grid>
      </div>
    </>
  );
}

CustomerSupport.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

const assistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🤝",
    backgroundColor: "bg-sky-300",
    name: "@supportExpert",
    description: (
      <>
        Surfaces relevant information from&nbsp;your Help Center, FAQs,
        knowledge base, online documentation, and&nbsp;tickets. Understands
        errors codes without help from&nbsp;the tech&nbsp;team
      </>
    ),
  },
  {
    emoji: "📡",
    backgroundColor: "bg-sky-300",
    name: "@productInfo",
    description: (
      <>
        Answer questions on&nbsp;product evolutions, engineering activity,
        alerts, and&nbsp;downtime
      </>
    ),
  },
  {
    emoji: "🔮",
    backgroundColor: "bg-sky-300",
    name: "@supportAnalyst",
    description: (
      <>
        Identifies patterns and&nbsp;sentiment in&nbsp;support interactions
        to&nbsp;highlight recurring needs and&nbsp;actionable initiatives based
        on&nbsp;the internal product team nomenclature and&nbsp;infrastructure
      </>
    ),
  },
  {
    emoji: "💡",
    backgroundColor: "bg-sky-300",
    name: "@supportOnboarding",
    description: (
      <>
        Helps new members of&nbsp;the support team navigate the&nbsp;tools
        and&nbsp;processes in&nbsp;their first weeks to&nbsp;set them up for
        success
      </>
    ),
  },
  {
    emoji: "🚨",
    backgroundColor: "bg-sky-300",
    name: "@supportAlerts",
    description: (
      <>
        Connects to&nbsp;product and&nbsp;engineering communication channels
        to&nbsp;surface ongoing engineering activity, incidents or&nbsp;issues
        and&nbsp;highlight the&nbsp;possible impact on&nbsp;users
        and&nbsp;customers
      </>
    ),
  },
  {
    emoji: "😳",
    backgroundColor: "bg-sky-300",
    name: "@whatWouldUserDo",
    description: (
      <>
        Crafts training, product documentation and&nbsp;training materials
        through the&nbsp;eyes of&nbsp;your users to&nbsp;help improve content
        ahead of&nbsp;issues
      </>
    ),
  },
];

export function CustomerCaroussel() {
  return (
    <CarousselContentBlock
      title={pageSettings.uptitle}
      subtitle={pageSettings.title}
      description={pageSettings.description}
      assistants={assistantExamples}
      from={pageSettings.from}
      to={pageSettings.to}
      border="border-pink-100/60"
      href="/home/solutions/customer-support"
    />
  );
}
