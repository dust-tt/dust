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
      shape: getParticleShapeIndexByName(shapeNames.bigSphere),
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
      Less busywork,
      <br />
      more deals.
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

export default function Sales() {
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
              Drop the&nbsp;cut-and-paste,
              <br />
              Hone your&nbsp;personal touch.
            </>
          }
          blocks={[
            {
              color: "emerald",
              contentBlocks: [
                {
                  title: <>Personalized outreach at&nbsp;scale</>,
                  content: [
                    <>
                      Craft optimized cold emails or&nbsp;follow-ups
                      effortlessly.
                    </>,
                    <>
                      Ensure your&nbsp;sales reps connect more effectively with
                      prospects, with personalized drafts ready for
                      their&nbsp;email outbox.
                    </>,
                  ],
                },
                {
                  title: <>Account snapshots and&nbsp;reports</>,
                  content: [
                    <>
                      Generate account summaries and&nbsp;reports
                      from&nbsp;across your&nbsp;CRM, Slack, and&nbsp;Notion.
                    </>,
                    <>
                      Keep every pipeline review focused on&nbsp;the strategic
                      outlook rather than administrative housekeeping.
                    </>,
                  ],
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
              Scale Sales Operations team
              <br />
              for fun and&nbsp;profit.
            </>
          }
          blocks={[
            {
              color: "emerald",
              contentBlocks: [
                {
                  title: <>Keep everyone on&nbsp;the same page</>,
                  content: [
                    <>
                      Ramping up and&nbsp;aligning fast-growing
                      or&nbsp;distributed teams gets harder.
                    </>,
                    <>
                      Enshrine templates and&nbsp;playbooks into assistants
                      to&nbsp;roll out a&nbsp;consistent and&nbsp;efficient
                      sales motion.
                    </>,
                  ],
                },
                {
                  title: <>Improve decision-making for sales leadership</>,
                  content: [
                    <>
                      Generate real-time insights on&nbsp;sales metrics
                      and&nbsp;team trends.
                    </>,
                    <>
                      Have your&nbsp;weekly reports and&nbsp;summaries ready
                      in&nbsp;a few seconds.
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
      href="/solutions/sales"
    />
  );
}
