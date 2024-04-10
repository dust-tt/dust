import type { ReactElement } from "react";

import {
  Block,
  ContentAssistantBlock,
  DroidItem,
  HeaderContentBlock,
} from "@app/components/home/new/ContentBlocks";
import { Grid, H2 } from "@app/components/home/new/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/new/LandingLayout";
import LandingLayout from "@app/components/home/new/LandingLayout";
import config from "@app/lib/api/config";
import { getSession } from "@app/lib/auth";
import {
  getUserFromSession,
  makeGetServerSidePropsRequirementsWrapper,
} from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";

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
    props: { gaTrackingId: config.getGaTrackingId(), shape: 5 },
  };
});

const defaultFlexClasses = "flex flex-col gap-4";

export default function RecruitingPeople() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Recruiting and People teams"
        title={
          <>
            Augment your&nbsp;team's producity,
            <br />
            provide great insights to your&nbsp;company.
          </>
        }
        from="from-amber-200"
        to="to-amber-400"
        subtitle={
          <>
            Onboarding&nbsp;better, Manage&nbsp;feedback, Support
            managers&nbsp;effectively, Scale performance analysis
            and&nbsp;Recruiting.
          </>
        }
      />
      <Grid gap="gap-8">
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "sm:col-span-10",
            "lg:col-span-4",
            "xl:col-span-4 xl:col-start-2"
          )}
        >
          <H2 className="text-white">
            Share knowledge better,
            <br />
            free time for you.
          </H2>
        </div>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-8 xl:col-span-6"
          layout="column sm:vertical"
          color="sky"
          content={
            <>
              <Block title="Onboard new people with accessible information at their pace">
                Transform your onboarding process using AI assistants design to
                guide knewcomers through your methodes, processes, people and
                culture.
              </Block>
              <Block title="Put your internal documentation to work">
                Create an assistant capable to answer any questions and point to
                the right internal ressources and spread your company culture
                and methods.
              </Block>
            </>
          }
          assistant=<>
            {peopleSlides[0]}
            {peopleSlides[1]}
          </>
        />
      </Grid>
      <Grid gap="gap-8">
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "sm:col-span-10",
            "lg:col-span-4",
            "xl:col-start-2"
          )}
        >
          <H2 className="text-white">Help your people grow.</H2>
        </div>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-8 xl:col-span-6"
          layout="column sm:vertical"
          color="emerald"
          content={
            <>
              <Block title="Better data">
                Good performance review is first good data. Collect informations
                from various channels to provide, get an holistic view of an
                employee's work, make more accurate evaluations.
              </Block>
              <Block title="Better Writing">
                Help your team write more thoughtfully. Challenges and enriches
                their writing with feedback on tone, refrences to the company’s
                operating principles, priorities and business objectives.
              </Block>
            </>
          }
          assistant=<></>
        />
        <ContentAssistantBlock
          className="col-span-12 xl:col-span-10 xl:col-start-2"
          color="pink"
          layout="column sm:vertical"
          content={
            <>
              <Block title="Better analysis">
                AI augmented with company knowledge will help you go through the
                volume, summarize, read between the lines, compare effectively.
              </Block>
              <Block title="Better decisions">
                Screen for diversity and inclusion and reduce the bias in
                performance reviews by providing a more comprehensive and
                objective analysis of employee performances.
              </Block>
              <Block title="Better restitution">
                Write more personalized and reach feedback for your team,
                development plans and career pathing for employees, aligning
                with their strengths and improvement areas.
              </Block>
            </>
          }
          assistant=<></>
        />
      </Grid>

      {/* HIRING */}
      <Grid gap="gap-8">
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "sm:col-span-10",
            "lg:col-span-4",
            "xl:col-start-3"
          )}
        >
          <H2 className="text-white">Boost your team hiring&nbsp;efforts.</H2>
        </div>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-8 xl:col-span-6 xl:col-start-1"
          layout="column sm:vertical"
          color="amber"
          content={
            <>
              <Block title="Level your team up on hiring">
                Make your company hiring practices, guidelines and knowledge
                easy to find and leverage for everyone. Make your team better at
                writing exercises, questions, revieweing exercises response,
                read through candidates subtext. Score a candidate’s take-home
                answers with your rubric in mind.
              </Block>
            </>
          }
          assistant=<>
            {peopleSlides[2]}
            {peopleSlides[3]}
          </>
        />
        <ContentAssistantBlock
          className="col-span-12 xl:col-span-6"
          layout="column sm:vertical"
          color="sky"
          content={
            <>
              <Block title="Make AI work for you">
                Analyse candidate’s CV in a second Extract information from
                texts, normalise lists of emails and names, batch write content.
                Draft job description, social media posts, outbound emails,
                interview questions in minutes, with company tones and
                structure.
              </Block>
            </>
          }
          assistant=<>
            {peopleSlides[4]}
            {peopleSlides[5]}
          </>
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

const peopleSlides = [
  <DroidItem
    key="0"
    emoji="🌱"
    avatarBackground="bg-sky-200"
    name="@onboardingBuddy"
    question="Your friendly guide to help new team members feel welcomed, informed, and integrated from day one."
  />,
  <DroidItem
    key="1"
    emoji="👋"
    avatarBackground="bg-sky-200"
    name="@people"
    question="Answer on slack all questions about processes, methodes, people and roles based on company documentation."
  />,
  <DroidItem
    key="2"
    emoji="🖋️"
    avatarBackground="bg-amber-200"
    name="@hiringOps"
    question="Draft job descriptions, emails, social media coms based on company standards."
  />,
  <DroidItem
    key="3"
    emoji="🔬"
    avatarBackground="bg-amber-200"
    name="@interviewReading"
    question="Help read and analyse candidate expert according to company principles."
  />,
  <DroidItem
    key="4"
    emoji="💬"
    avatarBackground="bg-sky-200"
    name="@hiringQuestions"
    question="Draft questions depending on the role, type of interview and stage in the process."
  />,
  <DroidItem
    key="5"
    emoji="🧐"
    avatarBackground="bg-sky-200"
    name="@candidate"
    question="Summarize available information about a candidate based on Company DB."
  />,
];
