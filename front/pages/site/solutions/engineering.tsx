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
      shape: getParticleShapeIndexByName(shapeNames.cube),
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
  uptitle: "Engineers and Developers",
  title: (
    <>
      Code smarter,
      <br />
      Resolve faster
    </>
  ),
  from: "from-emerald-200",
  to: "to-emerald-500",
  description: (
    <>
      Reduce interruptions, write better code, speed up incident response,
      and&nbsp;accelerate new engineers' onboarding.
    </>
  ),
};

export default function Engineering() {
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
          title={"Improve Code Quality."}
          blocks={[
            {
              color: "emerald",
              contentBlocks: [
                {
                  title: <>Talk to&nbsp;your&nbsp;codebase</>,
                  content: [
                    <>
                      Get conversational access to&nbsp;your entire code base.
                    </>,
                    <>
                      Accelerate onboarding for new engineers on&nbsp;the team
                      and&nbsp;reduce interruptions from&nbsp;other teams.
                    </>,
                  ],
                },
                {
                  title: <>Create your&nbsp;architecture copilot.</>,
                  content: (
                    <>
                      Specialize the&nbsp;best models (Gemini, GPT4, Mistral)
                      to&nbsp;answer general code questions with concise,
                      straight-to-the-point answers that have context
                      on&nbsp;the team's stack, runbooks, and&nbsp;architecture
                      preferences.
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
          title={
            <>
              Fight fires,
              <br />
              get&nbsp;back to&nbsp;Coding.
            </>
          }
          blocks={[
            {
              color: "emerald",
              contentBlocks: [
                {
                  title: (
                    <>
                      Protect your&nbsp;eng team with a&nbsp;help desk for most
                      situations
                    </>
                  ),
                  content: [
                    <>
                      Provide answers to&nbsp;questions from&nbsp;the rest
                      of&nbsp;the company automatically to&nbsp;avoid
                      interruptions.
                    </>,
                    <>
                      Give developers context on&nbsp;previous incidents
                      in&nbsp;seconds, without the&nbsp;need to&nbsp;ping last
                      time's hero.
                    </>,
                  ],
                },
                {
                  title: (
                    <>
                      Get the&nbsp;report done for the&nbsp;company to&nbsp;stay
                      in&nbsp;the know
                    </>
                  ),
                  content: [
                    <>
                      Generate weekly summaries on&nbsp;what shipped, what
                      broke, and&nbsp;what's in&nbsp;flight.
                    </>,
                    <>
                      Make these available to&nbsp;the team's stakeholders with
                      explanations on&nbsp;the technical terms they might not
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

Engineering.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

const assistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "⭐️",
    name: "@engGeneral",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Answers general questions about code architecture and&nbsp;engineering
        team processes
      </>
    ),
  },
  {
    emoji: "🏴‍☠️",
    name: "@codeGenius",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Answers general questions about code to&nbsp;avoid a&nbsp;trip
        to&nbsp;StackOverflow
      </>
    ),
  },
  {
    emoji: "📚",
    name: "@codebase",
    backgroundColor: "bg-emerald-300",
    description: <>Answers questions about the&nbsp;company codebase</>,
  },
  {
    emoji: "👨‍💻",
    name: "@engHelp",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Answers questions from&nbsp;the rest of&nbsp;the company
        on&nbsp;engineering definitions, ongoing projects, and&nbsp;who's
        on&nbsp;run
      </>
    ),
  },
  {
    emoji: "🚨",
    name: "@engIncidents",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Assists in&nbsp;the event of&nbsp;an incident with data on&nbsp;previous
        similar situation and&nbsp;their remediation
      </>
    ),
  },
  {
    emoji: "📡",
    name: "@engWeekly",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Writes a&nbsp;table of&nbsp;shipped and&nbsp;unshipped
        features—Summarizes incidents with impact, current status,
        and&nbsp;remediation plans
      </>
    ),
  },
];

export function EngineeringCaroussel() {
  return (
    <CarousselContentBlock
      title={pageSettings.uptitle}
      subtitle={pageSettings.title}
      description={pageSettings.description}
      assistants={assistantExamples}
      from={pageSettings.from}
      to={pageSettings.to}
      border="border-pink-100/60"
      href="/site/solutions/engineering"
    />
  );
}
