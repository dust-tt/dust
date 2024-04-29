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
      shape: getParticleShapeIndexByName(shapeNames.torus),
    },
  };
});

export default function RecruitingPeople() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Recruiting and People teams"
        title={<>More&nbsp;time for&nbsp;people, teams and&nbsp;managers.</>}
        from="from-amber-300"
        to="to-amber-400"
        subtitle={
          <>
            Onboard&nbsp;better, support managers&nbsp;and teams effectively,
            scale performance analysis and&nbsp;recruiting.
          </>
        }
      />
      <Grid>
        <SolutionSection
          title={
            <>
              Share knowledge better,
              <br />
              free time for you.
            </>
          }
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: (
                    <>
                      Onboard new people with accessible information at their
                      own pace.
                    </>
                  ),
                  content: (
                    <>
                      Transform your onboarding process using an&nbsp;AI
                      assistant designed to&nbsp;guide newcomers through your
                      methods, processes, people, and culture.
                    </>
                  ),
                },
                {
                  title: <>Put your internal documentation to work.</>,
                  content: (
                    <>
                      Create an&nbsp;assistant capable of&nbsp;answering any
                      questions, point to the right internal resources,
                      and&nbsp;spread your company culture and&nbsp;methods.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[0], assistantExamples[1]],
            },
          ]}
        />

        <SolutionSection
          title={<>Boost your team hiring&nbsp;efforts.</>}
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: <>Level your team up on hiring.</>,
                  content: (
                    <>
                      Make your company hiring practices, guidelines and
                      knowledge easy to find and leverage for everyone. Make
                      your team better at writing exercises, questions,
                      reviewing exercises response, read through candidates
                      subtext. Score a candidate’s take-home answers with your
                      rubric in mind.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[2], assistantExamples[3]],
            },
            {
              color: "amber",
              contentBlocks: [
                {
                  title: <>Make AI work for you.</>,
                  content: (
                    <>
                      Analyse candidate’s CV in a second. Extract information
                      from texts, normalise lists of emails and names, batch
                      write content. Draft job description, social media posts,
                      outbound emails, interview questions in minutes, with
                      company tones and structure.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[4], assistantExamples[5]],
            },
          ]}
        />
      </Grid>
    </>
  );
}

RecruitingPeople.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
  {
    emoji: "🌱",
    name: "@onboardingBuddy",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Your friendly guide to&nbsp;help new team members feel welcomed,
        informed, and&nbsp;integrated from day one.
      </>
    ),
  },
  {
    emoji: "👋",
    name: "@people",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Answer on&nbsp;slack all questions about processes, methodes, people
        and&nbsp;roles based&nbsp;on company documentation.
      </>
    ),
  },
  {
    emoji: "🖋️",
    name: "@hiringOps",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Draft job descriptions, emails, social media coms based&nbsp;on company
        standards.
      </>
    ),
  },
  {
    emoji: "🔬",
    name: "@interviewReading",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Help read and&nbsp;analyse candidate expert according to&nbsp;company
        principles.
      </>
    ),
  },
  {
    emoji: "💬",
    name: "@hiringQuestions",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Draft questions depending on&nbsp;the role, type of&nbsp;interview
        and&nbsp;stage in&nbsp;the process.
      </>
    ),
  },
  {
    emoji: "🧐",
    name: "@candidate",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Summarize available information about a&nbsp;candidate based&nbsp;on
        Company DB.
      </>
    ),
  },
  {
    emoji: "🏅",
    name: "@feedbackReview",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Collects achievements, drafts actionable reviews, helps formulate
        feedback.
      </>
    ),
  },
];
