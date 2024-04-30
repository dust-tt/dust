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
        uptitle="Dust&nbsp;for Sales Teams"
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
            Boost qualification, prospecting, and&nbsp;closing.
            <br />
            Practice demos, objection handling, and&nbsp;closing techniques.
          </>
        }
      />

      <Grid>
        <SolutionSection
          title={<>Better communication, Reduced fatigue</>}
          blocks={[
            {
              color: "emerald",
              contentBlocks: [
                {
                  title: <>Improved personalization</>,
                  content: (
                    <>
                      Craft personalized cold emails or follow-ups effortlessly.
                      Ensure your sales reps connect more effectively with
                      prospects, reducing the&nbsp;fatigue associated with
                      manual email personalization.
                    </>
                  ),
                },
                {
                  title: <>Account snapshots, reports or emails</>,
                  content: (
                    <>
                      Integrate Dust with your CRM, Slack, Notion,
                      and&nbsp;other platforms to&nbsp;generate account
                      snapshots, reports or emails. Help your sales team
                      to&nbsp;focus more on&nbsp;strategic tasks rather than
                      administrative duties.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[0], assistantExamples[1]],
            },
          ]}
        />
        <SolutionSection
          title={<>Scale your Sales Operations</>}
          blocks={[
            {
              color: "emerald",
              contentBlocks: [
                {
                  title: <>Onboard faster and&nbsp;keep your team updated</>,
                  content: (
                    <>
                      As your sales organization grows, ramping up
                      and&nbsp;aligning distributed teams gets harder. With
                      Dust, your templates and&nbsp;playbooks are encoded into
                      assistants, ensuring consistency across regions.
                    </>
                  ),
                },
                {
                  title: (
                    <>Create reports faster and&nbsp;improve decision-making</>
                  ),
                  content: (
                    <>
                      Transforms sales reporting by&nbsp;offering real-time
                      insights into&nbsp;sales metrics and&nbsp;trends.
                      Interface your assistants with your sales dashboard,
                      to&nbsp;generate instant reports and&nbsp;summaries.
                    </>
                  ),
                },
              ],
              assistantBlocks: [
                assistantExamples[2],
                assistantExamples[3],
                assistantExamples[4],
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
                title: <>Leverage Dust modular and&nbsp;extensible platform</>,
                content: [
                  <>
                    Assistants are not limited to&nbsp;information retrieval.
                    Dust apps empower engineers to&nbsp;create custom actions
                    by&nbsp;Rev ops and&nbsp;Sales assistants, possibly chaining
                    multiple models or calling into&nbsp;your CRM. Build custom
                    assistant actions and&nbsp;application orchestration
                    to&nbsp;fit your team's needs.
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
    name: "@emailWriter",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Prompt GPT-4 or Claude to&nbsp;generate personalized and&nbsp;effective
        cold emails or follow-up emails with the&nbsp;context of&nbsp;the
        relationship.
      </>
    ),
  },
  {
    emoji: "🔎",
    name: "@accountSummary",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Create snapshots of&nbsp;an account by&nbsp;retrieving data from our
        CRM, Slack, Notion.
      </>
    ),
  },
  {
    emoji: "📞",
    name: "@prepCall",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Point this assistant to&nbsp;battle cards, competitive intelligence
        data, and&nbsp;objection handling documentation. Help you prepare an
        important call.
      </>
    ),
  },
  {
    emoji: "📊",
    name: "@metricsGuru",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Answer any question on&nbsp;our metrics. Available in&nbsp;the sales
        Slack channel.
      </>
    ),
  },
  {
    emoji: "🔮",
    name: "@callInsight",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Chronologically process call transcripts to&nbsp;extract recurring
        themes or insights. Refactor this information in&nbsp;tables or
        summaries.
      </>
    ),
  },
];
