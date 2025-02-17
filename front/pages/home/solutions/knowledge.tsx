import type { ReactElement } from "react";
import React from "react";

import { BlogSection } from "@app/components/home/content/Product/BlogSection";
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
import TrustedBy from "@app/components/home/TrustedBy";

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.torus),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
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
      <TrustedBy />
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
              assistantBlocks: [assistantExamples[3], assistantExamples[4]],
            },
          ]}
        />
      </Grid>
      <BlogSection
        headerColorFrom="gradient from-sky-200"
        headerColorTo="to-sky-500"
      />
    </>
  );
}

Knowledge.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

const assistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🖋️",
    name: "@askTeam",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Provide employees with a go-to person to answer questions about a
        specific department.
      </>
    ),
  },
  {
    emoji: "🚀",
    name: "@weeklyHighlights",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Provide recurring recaps of projects, discussion channels or topics,
        making it easy to scan over insights.
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
    emoji: "👨‍🎤",
    name: "@onboardingBuddy",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Acts as&nbsp;a friendly guide to&nbsp;help new team members feel welcome
        and&nbsp;properly informed from&nbsp;day one and&nbsp;as they learn
        about the&nbsp;company.
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
];

export function KnowledgeCaroussel() {
  return (
    <CarousselContentBlock
      title={pageSettings.uptitle}
      subtitle={pageSettings.title}
      description={pageSettings.description}
      assistants={assistantExamples.slice(0, 4)}
      from={pageSettings.from}
      to={pageSettings.to}
      border="border-pink-100/60"
      href="/home/solutions/knowledge"
    />
  );
}
