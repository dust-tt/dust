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
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/new/Particles";
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

const defaultHClasses =
  "text-white col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3 pt-8 pb-4 text-center";

export default function Engineering() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Engineers and Developers"
        title={
          <>
            Work Smarter,
            <br />
            Resolve Faster
          </>
        }
        from="from-emerald-200"
        to="to-emerald-500"
        subtitle={
          <>
            Speed-up incident response, reduce interruptions, help your
            engineers produce better code, and accelerate new&nbsp;engineers
            on-boarding.
          </>
        }
      />

      <Grid>
        <H2 className={defaultHClasses}>
          Respond Faster to Incidents and Report Better
        </H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="emerald"
          content={
            <>
              <Block
                title={
                  <>
                    Retrieve useful context and previous relevant resolution in
                    seconds
                  </>
                }
              >
                <>
                  Your incident assistant will perform a semantic search on your
                  Notion, Confluence internal documentation, incident Slack
                  channels, or GitHub issues to surface useful context and
                  propose actionable next steps to resolve the problem at hand.
                </>
              </Block>
              <Block title={<>Create reports effortlessly</>}>
                Generate weekly summaries of shipped features and incidents. Run
                them before your team meetings to create structured,
                easy-to-parse tables automatically or periodically post their
                output to the rest of the company.
              </Block>
            </>
          }
          assistant={
            <>
              {assistantExamples[0]}
              {assistantExamples[1]}
            </>
          }
        />
        <H2 className={defaultHClasses}>Reduce Interruptions</H2>
        <ContentAssistantBlock
          className="col-span-12 md:col-span-8 md:col-start-3 lg:col-span-6 lg:col-start-4 xl:col-span-4 xl:col-start-5"
          layout="vertical"
          color="emerald"
          content={
            <>
              <Block title={<>Have your team assistant answer first</>}>
                Give it the right context and documentation and add it to Slack
                to answer questions from the rest of the company without
                creating an interruption for your team.
              </Block>
            </>
          }
          assistant={<>{assistantExamples[2]}</>}
        />
        <H2 className={defaultHClasses}>Improve Code Quality</H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="emerald"
          content={
            <>
              <Block title={<>Create your own copilot</>}>
                Specialize the best models (GPT4, Mistral) to answer code
                general questions with context on your stack and preferences as
                an engineering team. Reduce the verbosity of the model to get
                concise and straight-to-the-point answers.
              </Block>
              <Block title={<>With your codebase</>}>
                Give your assistant access to your team or the entire company’s
                code base. Let it answer any question about your code.
                Accelerate the onboarding of new engineers and diminish
                interruptions from other engineering teams.
              </Block>
            </>
          }
          assistant={
            <>
              {assistantExamples[2]}
              {assistantExamples[3]}
            </>
          }
        />
      </Grid>
    </>
  );
}

Engineering.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
  <DroidItem
    key="0"
    emoji="🚨"
    avatarBackground="bg-emerald-300"
    name="@incident"
    question="Search runbooks, past incidents discussions and resolution notes to provide actionable next-steps to resolve a new problem."
  />,
  <DroidItem
    key="1"
    emoji="📡"
    avatarBackground="bg-emerald-300"
    name="@weekly"
    question="Chronologically process Notion pages or Slack channels to extract recent incidents or shipped features and generate a report. "
  />,
  <DroidItem
    key="2"
    emoji="⭐️"
    avatarBackground="bg-emerald-300"
    name="@engineering"
    question="Answer any question about engineering at company."
  />,
  <DroidItem
    key="3"
    emoji="🏴‍☠️"
    avatarBackground="bg-emerald-300"
    name="@codeGenius"
    question="Answer general code questions."
  />,
  <DroidItem
    key="4"
    emoji="🤝"
    avatarBackground="bg-emerald-300"
    name="@codeCopilot"
    question="Draft code based on your codebase and infrastructure."
  />,
];
