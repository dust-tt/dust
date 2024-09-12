import type { ReactElement } from "react";

import {
  CarousselContentBlock,
  HeaderContentBlock,
} from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import type { SolutionSectionAssistantBlockProps } from "@app/components/home/SolutionSection";
import { SolutionSection } from "@app/components/home/SolutionSection";
import config from "@app/lib/api/config";

export async function getServerSideProps() {
  return {
    props: {
      gaTrackingId: config.getGaTrackingId(),
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
  uptitle: "Success and Support",
  title: <>Help your Support&nbsp;Teams, help your customers.</>,
  from: "from-sky-200",
  to: "to-sky-500",
  description: (
    <>
      Equip your&nbsp;team with AI&nbsp;assistants to&nbsp;accelerate issue
      resolution and&nbsp;increase customer&nbsp;satisfaction.
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
      href="/solutions/customer-support"
    />
  );
}
