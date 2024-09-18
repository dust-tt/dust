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

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.torus),
    },
  };
}

interface pageSettingsProps {
  uptitle: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  from: string;
  to: string;
}

const pageSettings: pageSettingsProps = {
  uptitle: "Knowledge Management",
  title: <>Bring your&nbsp;internal knowledge to&nbsp;life</>,
  from: "from-sky-200",
  to: "to-sky-500",
  description: (
    <>
      Keep internal content fresh, discoverable and&nbsp;truly useful.
      <br />
      Make it&nbsp;easy for teams to&nbsp;work smarter by&nbsp;tapping into
      the&nbsp;company's collective intelligence and&nbsp;expertise.
    </>
  ),
};

export default function Knowledge() {
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
          title={
            <>
              Keep internal documentation
              <br />
              up-to-date.
            </>
          }
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: (
                    <>Create company knowledge with&nbsp;minimal&nbsp;effort</>
                  ),
                  content: (
                    <>
                      Leverage existing discussions to reduce the time
                      and&nbsp;lift required to&nbsp;update and&nbsp;create
                      new&nbsp;internal content.
                    </>
                  ),
                },
                {
                  title: <>Keep internal documentation forever&nbsp;fresh</>,
                  content: (
                    <>
                      Compare and contrast existing documentation with internal
                      conversations to&nbsp;highlight areas in&nbsp;need of
                      a&nbsp;revision.
                    </>
                  ),
                },
              ],
              assistantBlocks: [
                assistantExamples[0],
                assistantExamples[1],
                assistantExamples[2],
              ],
            },
          ]}
        />
        <SolutionSection
          title={<>Upgrade internal communication and&nbsp;collaboration.</>}
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: <>Onboard at&nbsp;breakneck speed</>,
                  content: [
                    <>
                      Generate tailored onboarding experiences for newcomers
                      based on&nbsp;their skills and&nbsp;set them up for
                      success with personalized coaching.
                    </>,
                  ],
                },
                {
                  title: <>Tear down knowledge walls</>,
                  content: [
                    <>
                      Keep the&nbsp;company hive mind ahead of&nbsp;the curve
                      with answers to&nbsp;general questions.
                    </>,
                    <>
                      Foster collaboration across teams by&nbsp;freeing content
                      from&nbsp;the software silos it&nbsp;lives in. Translate
                      internal updates into a&nbsp;language each team can
                      understand.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [
                assistantExamples[3],
                assistantExamples[4],
                assistantExamples[5],
              ],
            },
          ]}
        />
      </Grid>
    </>
  );
}

Knowledge.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

const assistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🖋️",
    name: "@docsNew",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Creates documentation based on&nbsp;product and&nbsp;tech team's
        knowledge
      </>
    ),
  },
  {
    emoji: "🔬",
    name: "@docsUpdate",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Analyzes existing documentation in&nbsp;the context of&nbsp;internal
        discussions on&nbsp;product launches to&nbsp;highlight update
        requirements
      </>
    ),
  },
  {
    emoji: "🔎",
    name: "@docsFromTickets",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Explores support tickets and&nbsp;support team conversations
        to&nbsp;spot tribal operational knowledge that should be&nbsp;formalized
        once and for&nbsp;all
      </>
    ),
  },
  {
    emoji: "🚀",
    name: "@First90Days",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Quizzes new team members on&nbsp;company knowledge as&nbsp;they onboard
        on&nbsp;their specific team
      </>
    ),
  },
  {
    emoji: "🧑‍🍳",
    name: "@LikeImAnEngineer",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Translates internal memos focusing on&nbsp;the technical implications
        and&nbsp;providing reminders on&nbsp;certain business priorities
      </>
    ),
  },
  {
    emoji: "👨‍🎤",
    name: "@LikeImOnSales",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Explains technical concepts in&nbsp;the context of&nbsp;the company's
        infrastructure and&nbsp;data model
      </>
    ),
  },
];

export function KnowledgeCaroussel() {
  return (
    <CarousselContentBlock
      title={pageSettings.uptitle}
      subtitle={pageSettings.title}
      description={pageSettings.description}
      assistants={assistantExamples}
      from={pageSettings.from}
      to={pageSettings.to}
      border="border-pink-100/60"
      href="/home/solutions/knowledge"
    />
  );
}
