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
      shape: getParticleShapeIndexByName(shapeNames.wave),
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
  uptitle: "Data and Analytics",
  title: <>From Data to&nbsp;Action</>,
  from: "from-amber-200",
  to: "to-amber-500",
  description: (
    <>
      Focus on&nbsp;generating first-of-a-kind insights while AI helps with
      routine queries and&nbsp;standard reports across teams.
    </>
  ),
};

export default function DataAnalytics() {
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
              Give everyone access
              <br />
              to&nbsp;data analysis.
            </>
          }
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: <>Democratize data analysis</>,
                  content: [
                    <>
                      Enable anyone at the company to generate recurring
                      analyses using natural language to create SQL queries that
                      understand your database schemas.
                    </>,
                  ],
                },
                {
                  title: <>Reduce time to data insights</>,
                  content: [
                    <>
                      Turn .csv files, Notion databases, and Google Sheets into
                      data sources for quantitative analyses with assistants
                      that have a built-in understanding of your company’s
                      business terminology.
                    </>,
                  ],
                },
              ],

              assistantBlocks: [assistantExamples[0], assistantExamples[1]],
            },
          ]}
        />
        <SolutionSection
          title={
            <>
              Free the&nbsp;team
              <br />
              from&nbsp;being a&nbsp;perpetual help&nbsp;desk.
            </>
          }
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: (
                    <>
                      Streamline onboarding
                      <br />
                      for the&nbsp;data&nbsp;team
                    </>
                  ),
                  content: [
                    <>
                      Share up-to-date runbooks and internal documentation for
                      new data team members to ramp up efficiently and
                      autonomously with conversational assistants.
                    </>,
                  ],
                },
                {
                  title: (
                    <>
                      Improve internal documentation on&nbsp;internal
                      data&nbsp;sources
                    </>
                  ),
                  content: [
                    <>
                      Clean up or draft great documentation about your
                      infrastructure or fields, tables and relationships to be
                      clear to all.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [assistantExamples[2], assistantExamples[3]],
            },
          ]}
        />
      </Grid>
    </>
  );
}

DataAnalytics.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

const assistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "💬",
    name: "@SQLbuddy",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Generates simple SQL queries that understand business logic
        and&nbsp;fixes or&nbsp;improves existing ones
      </>
    ),
  },
  {
    emoji: "🔬",
    name: "@userMetrics",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Answers advanced questions about existing users by&nbsp;querying
        internal data.
      </>
    ),
  },
  {
    emoji: "📈",
    name: "@dataRun",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Answers questions about internal processes and&nbsp;runbooks on&nbsp;the
        data team
      </>
    ),
  },
  {
    emoji: "📚",
    name: "@dataModel",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Knows everything about data schemas and&nbsp;data model relationships
        at&nbsp;the company
      </>
    ),
  },
];

export function DataCaroussel() {
  return (
    <CarousselContentBlock
      title={pageSettings.uptitle}
      subtitle={pageSettings.title}
      description={pageSettings.description}
      assistants={assistantExamples}
      from={pageSettings.from}
      to={pageSettings.to}
      border="border-pink-100/60"
      href="/home/solutions/data-analytics"
    />
  );
}
