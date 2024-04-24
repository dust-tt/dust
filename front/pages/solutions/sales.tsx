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
      shape: getParticleShapeIndexByName(shapeNames.bigSphere),
    },
  };
});

const defaultHClasses =
  "text-white col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3 pt-8 pb-4 text-center";

export default function Sales() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Sales Teams"
        title={
          <>
            Accelerate your funnel,
            <br />
            hone your craft
          </>
        }
        from="from-emerald-200"
        to="to-emerald-500"
        subtitle={
          <>
            Boost qualification, prospecting, and closing.
            <br />
            Practice demos, objection handling, and closing techniques.
          </>
        }
      />

      <Grid>
        <H2 className={defaultHClasses}>
          Better communication,
          <br />
          Reduced fatigue
        </H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="emerald"
          content={
            <>
              <Block title={<>Improved personalization</>}>
                <>
                  Craft personalized cold emails or follow-ups effortlessly.
                  Ensure your sales reps connect more effectively with
                  prospects, reducing the fatigue associated with manual email
                  personalization.
                </>
              </Block>
              <Block title={<>Account snapshots, reports or emails</>}>
                Integrate Dust with your CRM, Slack, Notion, and other platforms
                to generate account snapshots, reports or emails. Help your
                sales team to focus more on strategic tasks rather than
                administrative duties.
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
        <H2 className={defaultHClasses}>Scale your Sales Operations</H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="emerald"
          content={
            <>
              <Block title={<>Onboard faster and keep your team updated</>}>
                As your sales organization grows, ramping up and aligning
                distributed teams gets harder. With Dust, your templates and
                playbooks are encoded into assistants, ensuring consistency
                across regions.
              </Block>
              <Block
                title={<>Create reports faster and improve decision-making</>}
              >
                Transforms sales reporting by offering real-time insights into
                sales metrics and trends. Interface your assistants with your
                sales dashboard, to generate instant reports and summaries.
              </Block>
            </>
          }
          assistant={
            <>
              {assistantExamples[2]}
              {assistantExamples[3]}
              {assistantExamples[4]}
            </>
          }
        />
        <H2 className={defaultHClasses}>Embedded in your Workflow</H2>
        <ContentAssistantBlock
          layout="vertical"
          color="emerald"
          className="col-span-12 md:col-span-8 md:col-start-3 lg:col-span-6 lg:col-start-4 xl:col-span-4 xl:col-start-5"
          content={
            <>
              <Block title={<>Leverage Dust modular and extensible platform</>}>
                Assistants are not limited to information retrieval. Dust apps
                empower engineers to create custom actions by Rev ops and Sales
                assistants, possibly chaining multiple models or calling into
                your CRM. Build custom assistant actions and application
                orchestration to fit your team’s needs.
              </Block>
            </>
          }
          assistant={<>More info https://docs.dust.tt</>}
        />
      </Grid>
    </>
  );
}

Sales.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
  <DroidItem
    key="0"
    emoji="🖋️"
    avatarBackground="bg-emerald-300"
    name="@emailWriter"
    question="Prompt GPT-4 or Claude to generate personalized and effective cold emails or follow-up emails with the context of the relationship."
  />,
  <DroidItem
    key="1"
    emoji="🔎"
    avatarBackground="bg-emerald-300"
    name="@accountSummary"
    question="Create snapshots of an account by retrieving data from our CRM, Slack, Notion."
  />,
  <DroidItem
    key="2"
    emoji="📞"
    avatarBackground="bg-emerald-300"
    name="@prepCall"
    question="Point this assistant to battle cards, competitive intelligence data, and objection handling documentation. Help you prepare an important call."
  />,
  <DroidItem
    key="3"
    emoji="📊"
    avatarBackground="bg-emerald-300"
    name="@metricsGuru"
    question="Answer any question on our metrics. Available in the sales Slack channel."
  />,
  <DroidItem
    key="4"
    emoji="🔮"
    avatarBackground="bg-emerald-300"
    name="@callInsight"
    question="Chronologically process call transcripts to extract recurring themes or insights. Refactor this information in tables or summaries."
  />,
];
