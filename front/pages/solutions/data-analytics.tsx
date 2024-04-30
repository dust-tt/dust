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
        uptitle="Dust&nbsp;for Data and&nbsp;Analytics Teams"
        title={<>From Data to&nbsp;Action</>}
        from="from-amber-200"
        to="to-amber-500"
        subtitle={
          <>
            Dedicate yourself&nbsp;to first-of-a-kind analyses for
            the&nbsp;product and&nbsp;business, while your assistants help your
            team with more standard queries and&nbsp;charts.
          </>
        }
      />

      <Grid>
        <SolutionSection
          title={<>Make all your team SQL fluent and&nbsp;Data literate</>}
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: (
                    <>
                      Package expert knowledge in&nbsp;easy-to-use assistants
                      in&nbsp;seconds
                    </>
                  ),
                  content: (
                    <>
                      Give your databases' schemas, your functions,
                      and&nbsp;your company's business definition to&nbsp;your
                      assistant. Let your SQL assistant answer your team's level
                      one SQL questions.
                    </>
                  ),
                },
                {
                  title: <>Reduce data analysis time</>,
                  content: (
                    <>
                      Create data assistants to&nbsp;turn natural language
                      questions into&nbsp;SQL queries. Ask questions
                      to&nbsp;your CSVs, Notion Database, and&nbsp;Google
                      Spreadsheets.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[0], assistantExamples[1]],
            },
          ]}
        />
        <SolutionSection
          title={<>Stop being the&nbsp;perpetual help desk</>}
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: (
                    <>Allow new team members to&nbsp;onboard autonomously</>
                  ),
                  content: (
                    <>
                      Give new members of&nbsp;the data team access
                      to&nbsp;continuously updated runbooks and&nbsp;internal
                      documentation with flexible and&nbsp;pedagogical
                      conversational assistants.
                    </>
                  ),
                },
                {
                  title: (
                    <>Talk to&nbsp;the data but also to&nbsp;the metadata</>
                  ),
                  content: (
                    <>
                      Help everyone in&nbsp;the team and&nbsp;beyond know what
                      fields or tables exist, what they mean, and&nbsp;how they
                      relate to&nbsp;each other. Clean up or draft great
                      documentation.
                    </>
                  ),
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

export const assistantExamples = [
  {
    emoji: "💬",
    name: "@SQLbuddy",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Your SQL copilot to&nbsp;generate simple queries, improve queries,
        and&nbsp;fix errors.
      </>
    ),
  },
  {
    emoji: "🔬",
    name: "@userMetrics",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Answer advanced questions about our users by&nbsp;querying our usage
        data.
      </>
    ),
  },
  {
    emoji: "📈",
    name: "@data",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Answer questions about the&nbsp;process, runbooks,
        and&nbsp;documentation of the&nbsp;data team.
      </>
    ),
  },
  {
    emoji: "📚",
    name: "@rolodex",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Your data Rolodex to&nbsp;know everything about data and&nbsp;metadata
        at the&nbsp;company.
      </>
    ),
  },
];
