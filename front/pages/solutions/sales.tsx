import type { ReactElement } from "react";

import { HeaderContentBlock } from "@app/components/home/new/ContentBlocks";
import { A, Grid } from "@app/components/home/new/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/new/LandingLayout";
import LandingLayout from "@app/components/home/new/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/new/Particles";
import { SolutionSection } from "@app/components/home/new/SolutionSection";
import config from "@app/lib/api/config";
import { getSession } from "@app/lib/auth";
import {
  getUserFromSession,
  makeGetServerSidePropsRequirementsWrapper,
} from "@app/lib/iam/session";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  gaTrackingId: string;
  shape: number;
}>(async (context) => {
  // Fetch session explicitly as this page redirects logged in users to our home page.
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  if (user && user.workspaces.length > 0) {
    let url = `/w/${user.workspaces[0].sId}`;

    if (context.query.inviteToken) {
      url = `/api/login?inviteToken=${context.query.inviteToken}`;
    }

    return {
      redirect: {
        destination: url,
        permanent: false,
      },
    };
  }

  return {
    props: {
      gaTrackingId: config.getGaTrackingId(),
      shape: getParticleShapeIndexByName(shapeNames.bigSphere),
    },
  };
});

export default function Sales() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust&nbsp;for Sales"
        title={
          <>
            Less busywork,
            <br />
            more deals.
          </>
        }
        from="from-emerald-200"
        to="to-emerald-500"
        subtitle={
          <>
            Boost qualification, prospecting, and&nbsp;closing.
            <br />
            Practice techniques from&nbsp;demos to&nbsp;objection handling.
          </>
        }
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
                  content: (
                    <>
                      Craft optimized cold emails or&nbsp;follow-ups
                      effortlessly. Ensure your&nbsp;sales reps connect more
                      effectively with prospects with personalized drafts ready
                      for their&nbsp;email outbox.
                    </>
                  ),
                },
                {
                  title: <>Account snapshots and&nbsp;reports</>,
                  content: (
                    <>
                      Generate account summaries and&nbsp;reports
                      from&nbsp;across your&nbsp;CRM, Slack, and&nbsp;Notion
                      reports. Keep every pipeline review focused on&nbsp;the
                      strategic outlook rather than administrative housekeeping.
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
            <>Scale your&nbsp;Sales Operations team for fun and&nbsp;profit.</>
          }
          blocks={[
            {
              color: "emerald",
              contentBlocks: [
                {
                  title: <>Keep everyone on&nbsp;the same page</>,
                  content: (
                    <>
                      Ramping up and&nbsp;aligning fast-growing
                      or&nbsp;distributed teams gets harder. Enshrine templates
                      and&nbsp;playbooks into assistants to&nbsp;roll out
                      a&nbsp;consistent and&nbsp;efficient sales motion.
                    </>
                  ),
                },
                {
                  title: <>Improve decision-making for sales leadership</>,
                  content: (
                    <>
                      Generate real-time insights on&nbsp;sales metrics
                      and&nbsp;team trends. Have your&nbsp;weekly reports
                      and&nbsp;summaries ready in&nbsp;a few seconds.
                    </>
                  ),
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
        <SolutionSection
          title={<>Embedded in&nbsp;your Workflow</>}
          blocks={[
            {
              color: "emerald",
              contentBlocks: {
                title: <>Leverage Dust modular and&nbsp;extensible platform.</>,
                content: [
                  <>
                    Assistants are not limited to&nbsp;information retrieval.
                    Dust apps empower engineers to&nbsp;create custom actions
                    by&nbsp;Rev ops and&nbsp;Sales assistants, possibly chaining
                    multiple models or&nbsp;calling into&nbsp;your CRM. Build
                    custom assistant actions and&nbsp;application orchestration
                    to&nbsp;fit your&nbsp;team's needs.
                  </>,
                  <>
                    More info Dust Platform's{" "}
                    <A href="https://docs.dust.tt" target="_blank">
                      Documentation
                    </A>
                    .
                  </>,
                ],
              },
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

export const assistantExamples = [
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
    name: "@CallWisdom",
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
