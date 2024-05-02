import type { ReactElement } from "react";

import { HeaderContentBlock } from "@app/components/home/new/ContentBlocks";
import { Grid } from "@app/components/home/new/ContentComponents";
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
      shape: getParticleShapeIndexByName(shapeNames.wave),
    },
  };
});

export default function DataAnalytics() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust&nbsp;for Data and&nbsp;Analytics"
        title={<>From Data to&nbsp;Action</>}
        from="from-amber-200"
        to="to-amber-500"
        subtitle={
          <>
            Focus on&nbsp;generating first-of-a-kind insights while AI helps
            with routine queries and&nbsp;standard reports across teams.
          </>
        }
      />

      <Grid>
        <SolutionSection
          title={<>Give everyone access to&nbsp;data analysis.</>}
          blocks={[
            {
              color: "amber",
              contentBlocks: {
                title: (
                  <>
                    Share the&nbsp;gift of&nbsp;data analysis.
                    <br />
                    Reduce time to&nbsp;data insights.
                  </>
                ),
                content: [
                  <>Enable anyone at&nbsp;the company to&nbsp;analyze data.</>,
                  <>
                    Ask questions using natural language instead of&nbsp;SQL
                    and&nbsp;process data sources such as&nbsp;.csv files,
                    Notion, and&nbsp;Google Spreadsheets using an&nbsp;assistant
                    that understands your&nbsp;company's business terminology,
                    custom functions and&nbsp;database schemas.
                  </>,
                ],
              },

              assistantBlocks: [assistantExamples[0], assistantExamples[1]],
            },
          ]}
        />
        <SolutionSection
          title={
            <>Free the&nbsp;team from&nbsp;being a&nbsp;perpetual help desk.</>
          }
          blocks={[
            {
              color: "amber",
              contentBlocks: {
                title: <>Streamline data team onboarding</>,
                content: [
                  <>
                    Share up-to-date runbooks and&nbsp;internal documentation
                    with&nbsp;conversational assistants, for&nbsp;new data team
                    members to&nbsp;ramp up efficiently and&nbsp;autonomously.
                  </>,
                  <>
                    Help Explain fields, tables, and&nbsp;the&nbsp;relationships
                    between them&nbsp;all.
                  </>,
                  <>
                    Clean up or&nbsp;draft great documentation about
                    your&nbsp;infrastructure.
                  </>,
                ],
              },
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

export const assistantExamples = [
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
