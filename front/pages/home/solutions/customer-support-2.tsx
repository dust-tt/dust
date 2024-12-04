import { Avatar, Div3D, Hover3D } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@app/components/home/Carousel";
import {
  BlogBlock,
  ImgBlock,
  MetricComponent,
  Quote,
} from "@app/components/home/ContentBlocks";
import {
  CarousselContentBlock,
  HeaderContentBlock,
} from "@app/components/home/ContentBlocks";
import {
  A,
  Grid,
  H2,
  H3,
  H4,
  P,
  Strong,
} from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import type { SolutionSectionAssistantBlockProps } from "@app/components/home/SolutionSection";
import { SolutionSection } from "@app/components/home/SolutionSection";
import TrustedBy from "@app/components/home/TrustedBy";
import { classNames } from "@app/lib/utils";

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
      Dust brings all your tools and company knowledge at your fingertips for
      endless possibilities.
    </>
  ),
};

export default function CustomerSupport() {
  return (
    <>
      <HeaderContentBlock
        uptitle={"Dust for " + pageSettings.uptitle}
        title={pageSettings.title}
        from={pageSettings.from}
        to={pageSettings.to}
        subtitle={pageSettings.description}
      />

      <Grid>
        <div
          className={classNames(
            "col-span-12 py-8",
            "grid grid-cols-1 gap-x-8 gap-y-20",
            "md:grid-cols-3 md:gap-y-16",
            "2xl:col-span-10 2xl:col-start-2"
          )}
        >
          <ImgBlock
            title={
              <>
                Resolve
                <br />
                faster.
              </>
            }
            content={
              <>
                Surface relevant information from all connected knowledge bases
                instantly and understand messages in 50+ languages.
              </>
            }
          >
            <Avatar size="xl" emoji={"💡"} backgroundColor={"bg-sky-300"} />
          </ImgBlock>
          <ImgBlock
            title={
              <>
                Boost
                <br />
                Team Productivity.
              </>
            }
            content={
              <>
                Keep teams synchronized with real-time access to information
                across all communication channels and reduce onboarding times.
              </>
            }
          >
            <Avatar size="xl" emoji={"🪄"} backgroundColor={"bg-sky-300"} />
          </ImgBlock>
          <ImgBlock
            title={
              <>
                Understand <br />
                customer needs.
              </>
            }
            content={
              <>
                Gain insights from coss-tool interactions to undertstand and act
                on customer needs, improve documentation.
              </>
            }
          >
            <Avatar size="xl" emoji={"🚀"} backgroundColor={"bg-sky-300"} />
          </ImgBlock>
        </div>

        <TrustedBy />

        <MetricComponent
          metrics={[
            {
              value: "15x",
              description:
                "Responses generated 15x faster after implementing Dust",
            },
            {
              value: "8h",
              description: "Save 8 hours per agent per week on average",
            },
          ]}
          from={pageSettings.from}
          to={pageSettings.to}
        />

        <SolutionSection
          title="Top customer support use-cases."
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: <>Ticket resolution assistance</>,
                  content: [
                    <>
                      Smart answer suggestions and contextual knowledge at your
                      fingertips.
                    </>,
                  ],
                },
                {
                  title: <>Onboarding, coaching</>,
                  content: [
                    <>
                      Helps new support agents learn best practices and company
                      knowledge faster.
                    </>,
                  ],
                },
                {
                  title: <>Documentation builder</>,
                  content: [
                    <>
                      Convert resolved support tickets into searchable knowledge
                      base articles.
                    </>,
                  ],
                },
                {
                  title: <>Customer insights and voice</>,
                  content: [
                    <>
                      Turn customer feedback from every channel into actionable
                      insights. Identify trends and opportunities to drive
                      product decisions.
                    </>,
                  ],
                },
              ],
            },
          ]}
        />

        <Quote quote="We're managing a higher volume of tickets and have cut processing time—from an average of 6 minutes per ticket to just a few seconds" />

        <div
          className={classNames(
            "flex flex-col gap-8",
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-9 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H2 from={pageSettings.from} to={pageSettings.to}>
            How Dust boosts
            <br />
            support teams at:
          </H2>
        </div>
        <div className="col-span-12 flex flex-col items-center gap-4">
          <Carousel className="w-full">
            <CarouselContent>
              <CarouselItem className="basis-full md:basis-1/2 md:px-6 lg:basis-1/3">
                <BlogBlock
                  title="Navigating Growth and Innovation with November Five’s Dario Prskalo"
                  content="Discover how November Five leverages AI with Dust to enhance efficiency and maintain a human touch in their digital solutions."
                  href="https://blog.dust.tt/november-five-ai-transformation-dust/"
                >
                  <img
                    src="https://blog.dust.tt/content/images/size/w2000/2024/04/DSCF6552-1.jpeg"
                    alt="Blog Image"
                  />
                </BlogBlock>
              </CarouselItem>
              <CarouselItem className="basis-full px-6 md:basis-1/2 lg:basis-1/3">
                <BlogBlock
                  title="How Eléonore improved the efficiency of Pennylane’s Care team thanks to Dust"
                  content="Discover how Pennylane leveraged Dust’s specialized virtual assistants to improve efficiency and optimize workflows."
                  href="https://blog.dust.tt/pennylane-dust-customer-support-journey/"
                >
                  <img
                    src="https://blog.dust.tt/content/images/size/w2000/2024/04/Ele-onore-MOTTE--1--1.jpg"
                    alt="Blog Image"
                  />
                </BlogBlock>
              </CarouselItem>
              <CarouselItem className="basis-full px-6 md:basis-1/2 lg:basis-1/3">
                <BlogBlock
                  title="Integrating AI for Enhanced Workflows at Alan"
                  content="Discover how Alan revolutionizes healthcare and enhances workflows using AI. See how @code-help and Dust streamline developer tasks."
                  href="https://blog.dust.tt/integrating-ai-workflows-alan/"
                >
                  <img
                    src="https://blog.dust.tt/content/images/size/w2000/2024/03/cover-vincent.png"
                    alt="Blog Image"
                  />
                </BlogBlock>
              </CarouselItem>
            </CarouselContent>
          </Carousel>
        </div>
      </Grid>
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
