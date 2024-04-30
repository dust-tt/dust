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
      shape: getParticleShapeIndexByName(shapeNames.cube),
    },
  };
});

export default function Engineering() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Engineers and&nbsp;Developers"
        title={
          <>
            Work Smarter,
            <br />
            Resolve Faster.
          </>
        }
        from="from-emerald-200"
        to="to-emerald-500"
        subtitle={
          <>
            Speed-up incident response, reduce interruptions, help your
            engineers produce better code, and&nbsp;accelerate
            new&nbsp;engineers on-boarding.
          </>
        }
      />

      <Grid>
        <SolutionSection
          title={<>Respond Faster to&nbsp;Incidents and&nbsp;Report Better.</>}
          blocks={[
            {
              color: "emerald",
              contentBlocks: [
                {
                  title: (
                    <>
                      Retrieve useful context and&nbsp;previous relevant
                      resolution in&nbsp;seconds.
                    </>
                  ),
                  content: (
                    <>
                      Your incident assistant will perform a&nbsp;semantic
                      search on&nbsp;your Notion, Confluence internal
                      documentation, incident Slack channels, or&nbsp;GitHub
                      issues to&nbsp;surface useful context and&nbsp;propose
                      actionable next steps to&nbsp;resolve the&nbsp;problem
                      at&nbsp;hand.
                    </>
                  ),
                },
                {
                  title: "Create reports effortlessly.",
                  content: (
                    <>
                      Generate weekly summaries of&nbsp;shipped features and
                      incidents. Run them before your team meetings
                      to&nbsp;create structured, easy-to-parse tables
                      automatically or periodically post their output
                      to&nbsp;the&nbsp;rest of&nbsp;the&nbsp;company.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[0], assistantExamples[1]],
            },
          ]}
        />
        <SolutionSection
          title={<>Reduce Interruptions.</>}
          blocks={[
            {
              color: "emerald",
              contentBlocks: {
                title: "Have your team assistant answer first.",
                content: (
                  <>
                    Give it the&nbsp;right context and&nbsp;documentation
                    and&nbsp;add it to&nbsp;Slack to&nbsp;answer questions from
                    the&nbsp;rest of&nbsp;the&nbsp;company without creating
                    an&nbsp;interruption for your team.
                  </>
                ),
              },
              assistantBlocks: assistantExamples[2],
            },
          ]}
        />
        <SolutionSection
          title="Improve Code Quality."
          blocks={[
            {
              color: "emerald",
              contentBlocks: [
                {
                  title: "Create your own copilot.",
                  content: (
                    <>
                      Specialize the&nbsp;best models (GPT4, Mistral)
                      to&nbsp;answer code general questions with context
                      on&nbsp;your stack and&nbsp;preferences
                      as&nbsp;an&nbsp;engineering team. Reduce
                      the&nbsp;verbosity of&nbsp;the&nbsp;model to&nbsp;get
                      concise and&nbsp;straight-to-the-point answers.
                    </>
                  ),
                },
                {
                  title: "With your codebase.",
                  content: (
                    <>
                      Give your assistant access to&nbsp;your team
                      or&nbsp;the&nbsp;entire company's code base. Let it answer
                      any question about your code. Accelerate
                      the&nbsp;onboarding of&nbsp;new engineers
                      and&nbsp;diminish interruptions from other engineering
                      teams.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[3], assistantExamples[4]],
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

export const assistantExamples = [
  {
    emoji: "🚨",
    name: "@incident",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Search runbooks, past incidents discussions and&nbsp;resolution notes
        to&nbsp;provide actionable next-steps to&nbsp;resolve a&nbsp;new
        problem.
      </>
    ),
  },
  {
    emoji: "📡",
    name: "@weekly",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Chronologically process Notion pages or&nbsp;Slack channels
        to&nbsp;extract recent incidents or&nbsp;shipped features
        and&nbsp;generate a&nbsp;report.
      </>
    ),
  },
  {
    emoji: "⭐️",
    name: "@engineering",
    backgroundColor: "bg-emerald-300",
    description: <>Answer any question about engineering at&nbsp;company.</>,
  },
  {
    emoji: "🏴‍☠️",
    name: "@codeGenius",
    backgroundColor: "bg-emerald-300",
    description: <>Answer general code questions.</>,
  },
  {
    emoji: "🤝",
    name: "@codeCopilot",
    backgroundColor: "bg-emerald-300",
    description: (
      <>Draft code based&nbsp;on your codebase and&nbsp;infrastructure.</>
    ),
  },
];
