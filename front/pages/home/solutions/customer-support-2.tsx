import type { ReactElement } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@app/components/home/Carousel";
import {
  BlogBlock,
  MetricComponent,
  Quote,
} from "@app/components/home/ContentBlocks";
import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid, H2 } from "@app/components/home/ContentComponents";
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
  title: (
    <>
      Instant knowledge,
      <br />
      exceptional support.
    </>
  ),
  from: "from-sky-200",
  to: "to-sky-500",
  description: (
    <>
      Dust brings all your&nbsp;tools and&nbsp;company knowledge at
      your&nbsp;fingertips for&nbsp;endless&nbsp;possibilities.
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
        <TrustedBy />

        <MetricComponent
          metrics={[
            {
              value: "15x",
              description: (
                <>
                  Responses generated 15x&nbsp;faster
                  after&nbsp;implementing&nbsp;Dust
                </>
              ),
            },
            {
              value: "8h",
              description: (
                <>
                  Save 8&nbsp;hours per&nbsp;agent per&nbsp;week on&nbsp;average
                </>
              ),
            },
          ]}
          from="from-amber-200"
          to="to-amber-500"
        />

        <SolutionSection
          title="Top customer support use-cases."
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: <>Resolve faster</>,
                  content: [
                    <>
                      Surface relevant information from all connected knowledge
                      bases instantly and understand messages in 50+ languages.
                    </>,
                  ],
                },
                {
                  title: <>Boost team productivity</>,
                  content: [
                    <>
                      Keep teams synchronized with real-time access to
                      information across all communication channels and reduce
                      onboarding times.
                    </>,
                  ],
                },
                {
                  title: <>Understand customer needs</>,
                  content: [
                    <>
                      Gain insights from coss-tool interactions to undertstand
                      and act on customer needs, improve documentation.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [
                assistantExamples[0],
                assistantExamples[1],
                assistantExamples[2],
                assistantExamples[3],
              ],
            },
          ]}
        />

        <Quote
          quote="we’re managing a&nbsp;higher volume of&nbsp;tickets and have cut processing time—from an&nbsp;average of 5&nbsp;minutes per ticket to&nbsp;just a&nbsp;few seconds. This allows the&nbsp;team to&nbsp;focus on more complex requests, ultimately improving the&nbsp;overall quality and speed of&nbsp;customer support."
          name="Anaïs Ghelfi"
          title="Head of Data Platform at Malt"
          logo="/static/landing/logos/malt.png"
        />

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
            How&nbsp;Dust boosts support teams&nbsp;at:
          </H2>
        </div>
        <div className="col-span-12 flex flex-col items-center gap-4">
          <Carousel className="w-full">
            <CarouselContent>
              <CarouselItem className="basis-full md:basis-1/2 md:px-6 lg:basis-1/3">
                <BlogBlock
                  title="How Eléonore, Care Team Lead at Pennylane, Uses Dust"
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
                  title="Qonto partners with Dust to upgrade its customer experience"
                  content="Qonto streamlines operations with Dust's AI assistants, saving 50,000 hours yearly."
                  href="https://blog.dust.tt/qonto-dust-ai-partnership/"
                >
                  <img
                    src="https://blog.dust.tt/content/images/size/w2000/2024/11/qonto_dust.jpg"
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

const assistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🔍",
    name: "Ticket Resolution",
    backgroundColor: "bg-sky-300",
    description: (
      <>Smart answer suggestions and contextual knowledge at your fingertips.</>
    ),
  },
  {
    emoji: "🎓",
    name: "Agent Coaching",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Helps new support agents learn bst practices and company knowledge
        faster.
      </>
    ),
  },
  {
    emoji: "📝",
    name: "Documentation Builder",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Converts resolved support tickets into searchable knowledge base
        articles and FAQ.
      </>
    ),
  },
  {
    emoji: "📢",
    name: "Customer Voice",
    backgroundColor: "bg-sky-300",
    description: (
      <>Turn customer feedback from every channel into actionable insights.</>
    ),
  },
];

CustomerSupport.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
