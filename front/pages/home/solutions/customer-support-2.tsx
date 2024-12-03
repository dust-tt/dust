import { Avatar, Div3D, Hover3D } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import { ImgBlock } from "@app/components/home/ContentBlocks";
import {
  CarousselContentBlock,
  HeaderContentBlock,
} from "@app/components/home/ContentBlocks";
import {
  A,
  Grid,
  H2,
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
  title: <>Instant knowledge, Exceptional support.</>,
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
            "col-span-12 pt-8",
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
                Boost Team
                <br />
                Productivity.
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
            title={<>Understand customer needs.</>}
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

        <div
          className={classNames(
            "col-span-12 flex flex-col items-center py-8",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-8 xl:col-start-3"
          )}
        >
          <H4 className="w-full text-center text-white">
            Trusted by 500+ organizations, including:
          </H4>
          <div
            className={classNames(
              "max-w-[400px] sm:w-full sm:max-w-none",
              "grid grid-cols-2 gap-x-2",
              "md:grid-cols-5 md:gap-x-12"
            )}
          >
            <img alt="alan" src="/static/landing/logos/alan.png" />
            <img alt="qonto" src="/static/landing/logos/qonto.png" />
            <img alt="pennylane" src="/static/landing/logos/pennylane.png" />
            <img alt="payfit" src="/static/landing/logos/payfit.png" />
            <img alt="watershed" src="/static/landing/logos/watershed.png" />
          </div>
        </div>
      </Grid>

      <Grid>
        <SolutionSection
          title={<>Exceed customer&nbsp;expectations.</>}
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: (
                    <>Parse tickets and&nbsp;get to&nbsp;resolution faster</>
                  ),
                  content: [
                    <>
                      Allow agents to&nbsp;understand customer messages
                      and&nbsp;technical errors faster and&nbsp;in
                      50+&nbsp;languages.
                    </>,
                    <>
                      Build AI assistants based on&nbsp;company knowledge
                      and&nbsp;past support interactions to&nbsp;bring
                      the&nbsp;company's collective intelligence to&nbsp;the
                      support team's fingertips.
                    </>,
                  ],
                },
                {
                  title: (
                    <>Keep your&nbsp;team up-to-date at&nbsp;all&nbsp;times</>
                  ),
                  content: [
                    <>Break down information silos.</>,
                    <>
                      Give your frontline team access to&nbsp;up-to-date
                      information on&nbsp;projects, ongoing product incidents
                      or&nbsp;issues to&nbsp;help them&nbsp;take action
                      thoughtfully.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [
                assistantExamples[0],
                assistantExamples[4],
                assistantExamples[5],
              ],
            },
          ]}
        />
        <SolutionSection
          title="Elevated team collaboration."
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: (
                    <>
                      Bring new team members
                      <br />
                      up-to-speed&nbsp;fast
                    </>
                  ),
                  content: [
                    <>
                      Reduce your&nbsp;onboarding and&nbsp;training time
                      drastically.
                    </>,
                    <>
                      Put your&nbsp;documentation on&nbsp;processes
                      and&nbsp;methods to&nbsp;work to&nbsp;help the&nbsp;team
                      learn autonomously.
                    </>,
                  ],
                },
                {
                  title: (
                    <>
                      Maintain visibility
                      <br />
                      on&nbsp;customer needs
                    </>
                  ),
                  content: [
                    <>
                      Surface insights from&nbsp;interactions with customers
                      to&nbsp;your Support, Success and&nbsp;Product teams.
                    </>,
                    <>
                      Maintain a&nbsp;continuous understanding of&nbsp;customer
                      needs to inform your&nbsp;product priorities.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [assistantExamples[3], assistantExamples[2]],
            },
          ]}
        />
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
