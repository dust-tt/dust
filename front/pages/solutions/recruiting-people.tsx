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
        uptitle="Dust for Recruiting and&nbsp;People teams"
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
          title="Eliminate repetitive tasks."
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: (
                    <>
                      Onboard new&nbsp;people with readily available information
                      at&nbsp;their own&nbsp;pace.
                    </>
                  ),
                  content: (
                    <>
                      Transform your onboarding process using an&nbsp;AI
                      assistant designed to&nbsp;guide newcomers through your
                      methods, processes, people, and&nbsp;culture.
                    </>
                  ),
                },
                {
                  title: <>Put your internal documentation to&nbsp;work.</>,
                  content: (
                    <>
                      Create an&nbsp;assistant capable of&nbsp;answering any
                      questions, point to&nbsp;the right internal resources,
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
          title="Nurture Employee Growth."
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: "Create engaging learning experiences.",
                  content: (
                    <>
                      Use information from internal data sources, such
                      as&nbsp;onboarding guides, process documents,
                      and&nbsp;best practices, to&nbsp;create training scripts
                      and&nbsp;materials tailored to&nbsp;each role
                      or&nbsp;department.
                    </>
                  ),
                },
                {
                  title: <>Improve feedback and&nbsp;reviews.</>,
                  content: [
                    <>
                      Collect data from various channels to&nbsp;get
                      a&nbsp;holistic view of&nbsp;each employee's work
                      and&nbsp;make more accurate evaluations.
                    </>,
                    <>
                      Help your team write more thoughtfully,
                      with&nbsp;AI-powered feedback on&nbsp;tone, references
                      to&nbsp;company principles, priorities, and&nbsp;business
                      objectives.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [assistantExamples[7], assistantExamples[6]],
            },
          ]}
        />
        <SolutionSection
          title="Scale your hiring."
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: <>Next level training & guidance.</>,
                  content: [
                    <>
                      Make your&nbsp;company hiring practices, guidelines,
                      and&nbsp;knowledge easy to&nbsp;find and&nbsp;leverage for
                      everyone.
                    </>,
                    <>
                      Train your team at&nbsp;writing exercises
                      and&nbsp;questions, reviewing exercises' responses,
                      and&nbsp;reading through candidates' subtexts.
                    </>,
                  ],
                },
                {
                  title: <>Customized written analysis assistance.</>,
                  content: [
                    <>
                      Score a&nbsp;candidate's take-home answers with
                      your&nbsp;rubric in&nbsp;mind.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [assistantExamples[2], assistantExamples[3]],
            },
          ]}
        />

        <SolutionSection
          title="Automate recurrent hiring tasks."
          blocks={[
            {
              color: "amber",
              contentBlocks: [
                {
                  title: <>Analyze &&nbsp;extract.</>,
                  content: [
                    <>
                      Analyze a&nbsp;candidate's CV in&nbsp;a&nbsp;second.
                      Extract information from&nbsp;texts, normalize lists
                      of&nbsp;emails and&nbsp;names, and&nbsp;batch-write
                      content.
                    </>,
                  ],
                },
                {
                  title: <>The page is&nbsp;never white.</>,
                  content: [
                    <>
                      Draft job description, social media posts, outbound
                      emails, interview questions in&nbsp;minutes,
                      with&nbsp;company tones and&nbsp;structure.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [assistantExamples[5], assistantExamples[4]],
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
        Answer all questions about processes, methods, people and&nbsp;roles
        based&nbsp;on company documentation directly on&nbsp;Slack.
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
        Help read and&nbsp;analyze candidate expert according to&nbsp;company
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
        Summarize available information about a&nbsp;candidate based
        on&nbsp;your&nbsp;company database.
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
  {
    emoji: "🧑‍🏫",
    name: "@trainingCurator",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Curates learning paths, designs training modules, and&nbsp;crafts
        employee development&nbsp;plans.
      </>
    ),
  },
];
