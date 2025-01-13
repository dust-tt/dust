import {
  Button,
  Div3D,
  Hover3D,
  RocketIcon,
  UserGroupIcon,
  LightbulbIcon,
} from "@dust-tt/sparkle";
import type { ReactElement } from "react-markdown/lib/react-markdown";
import Link from "next/link";

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
  uptitle: "Sales",
  title: (
    <>
      Less busywork, <br></br>more deals.
    </>
  ),
  from: "from-emerald-200",
  to: "to-emerald-500",
  description: (
    <>
      Boost qualification, prospecting, and&nbsp;closing.
      <br />
      Practice techniques from&nbsp;demos to&nbsp;objection handling.
    </>
  ),
};

// Settings for Hero section -------------------------------- TO CHANGE
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
    title: "Minimize Manual Operations",
    description: "TBD",
  },
  {
    icon: UserGroupIcon,
    title: "Increase the Odds of Closing",
    description: "TBD",
  },
  {
    icon: LightbulbIcon,
    title: "Drive Efficiency and Performance",
    description: "TBD",
  },
];

// Parameters for the Use Cases Section
const supportUseCases: UseCase[] = [
  {
    title: "Account Snapshots",
    content: "Create account snapshots with key historical interactions.",
    images: [
      "/static/landing/solutions/support1.png",
      "/static/landing/solutions/support1.png",
      "/static/landing/solutions/support1.png",
      "/static/landing/solutions/support1.png",
    ],
  },
  {
    title: "Prospect Question Handling",
    content: "Address questions instantly and fill RFPs with precise insights.",
    images: [
      "/static/landing/solutions/support2.png",
      "/static/landing/solutions/support2.png",
      "/static/landing/solutions/support2.png",
      "/static/landing/solutions/support2.png",
    ],
  },
  {
    title: "Meeting Summaries",
    content:
      "Customize recaps highlighting crucial insights from calls or meetings.",
    images: [
      "/static/landing/solutions/support3.png",
      "/static/landing/solutions/support3.png",
      "/static/landing/solutions/support3.png",
      "/static/landing/solutions/support3.png",
    ],
  },
  {
    title: "Personalized Communication",
    content:
      "Craft personalized emails using context, real-time info, and templates.",
    images: [
      "/static/landing/solutions/support4.png",
      "/static/landing/solutions/support4.png",
      "/static/landing/solutions/support4.png",
      "/static/landing/solutions/support4.png",
    ],
  },
];

// Parameters for the Customer Stories Section
const salesStories: CustomerStory[] = [
  {
    title: "Kyriba accelerates innovation with Dust",
    content:
      "Kyriba saves thousands of hours by turning AI assistants into innovation catalysts.",
    href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
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

export default function Sales() {
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
              title="Elevate sales operations"
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
              quote="It's pretty miraculous. It answers (correctly 😱) tons of GTM questions that I used to answer. It gets the nuance right and cites its sources."
              name="Everett Berry"
              title="Head of GTM Engineering at Clay"
              logo="/static/landing/logos/clay.png"
            />
            <CustomerStoriesSection
              title="Customer stories"
              stories={salesStories}
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

Sales.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

const assistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🖋️",
    name: "@outboundDraft",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Generates personalized and&nbsp;effective cold emails or&nbsp;follow-up
        emails with the&nbsp;context of&nbsp;the relationship
      </>
    ),
  },
  {
    emoji: "🔎",
    name: "@accountSummary",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Creates a&nbsp;snapshot by&nbsp;retrieving data from&nbsp;your CRM,
        Slack, Notion, including health and&nbsp;sentiment to&nbsp;understand
        where to&nbsp;focus attention
      </>
    ),
  },
  {
    emoji: "📞",
    name: "@callCoach",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Points to&nbsp;battle cards, competitive intelligence,
        and&nbsp;objection handling documentation to&nbsp;increase conversion
      </>
    ),
  },
  {
    emoji: "📊",
    name: "@salesMetrics",
    backgroundColor: "bg-emerald-300",
    description: (
      <>Answers any question on&nbsp;revenue metrics directly from&nbsp;Slack</>
    ),
  },
  {
    emoji: "🔮",
    name: "@salesWisdom",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Processes all call transcripts to&nbsp;extract recurring themes
        or&nbsp;insights
      </>
    ),
  },
  {
    emoji: "🚀",
    name: "@salesShoutout",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Highlights performance outliers across the&nbsp;team based on&nbsp;CRM
        data and&nbsp;growth priorities
      </>
    ),
  },
];

export function SalesCaroussel() {
  return (
    <CarousselContentBlock
      title={pageSettings.uptitle}
      subtitle={pageSettings.title}
      description={pageSettings.description}
      assistants={assistantExamples}
      from={pageSettings.from}
      to={pageSettings.to}
      border="border-pink-100/60"
      href="/home/solutions/sales"
    />
  );
}
