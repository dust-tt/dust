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
            Code smarter,
            <br />
            Resolve faster
          </>
        }
        from="from-emerald-200"
        to="to-emerald-500"
        subtitle={
          <>
            Reduce interruptions, write better code, speed up incident response,
            and&nbsp;accelerate new engineers' onboarding.
          </>
        }
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
                      Give your&nbsp;eng team a&nbsp;help desk for each
                      situation
                    </>
                  ),
                  content: (
                    <>
                      Provide answers to&nbsp;questions from&nbsp;the rest
                      of&nbsp;the company automatically to&nbsp;avoid avoidable
                      interruptions. Give developers context from&nbsp;previous
                      incidents in&nbsp;seconds without the&nbsp;need
                      to&nbsp;ping last time's hero.
                    </>
                  ),
                },
                {
                  title: (
                    <>
                      Get the&nbsp;report done for the&nbsp;company to&nbsp;stay
                      in&nbsp;the know
                    </>
                  ),
                  content: (
                    <>
                      Generate weekly summaries on&nbsp;what broke, what
                      shipped, and&nbsp;what's in&nbsp;flight. Make these
                      available to&nbsp;the team's stakeholders with
                      explanations on&nbsp;the technical terms they might not
                      understand.
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
      </Grid>
    </>
  );
}

Engineering.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
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
    emoji: "🏴‍☠️",
    name: "@MAN",
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
        on&nbsp;run from&nbsp;internal data
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
