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
      shape: getParticleShapeIndexByName(shapeNames.pyramid),
    },
  };
});

export default function Marketing() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Marketing Teams"
        title={
          <>
            Ensure brand voice
            <br />
            and&nbsp;content consistency across all&nbsp;mediums and&nbsp;teams.
          </>
        }
        from="from-pink-200"
        to="to-pink-500"
        subtitle={
          <>
            Leverage AI assistants to&nbsp;generate innovative ideas
            and&nbsp;high-quality content. Streamline your&nbsp;creative process
            and&nbsp;adapt content for international&nbsp;markets.
          </>
        }
      />

      <Grid>
        <SolutionSection
          title={
            <>
              Create better content,
              <br />
              faster and on-brand.
            </>
          }
          blocks={[
            {
              color: "pink",
              contentBlocks: [
                {
                  title: (
                    <>
                      Accelerate your&nbsp;content generation across&nbsp;blogs,
                      websites, and&nbsp;social media.
                    </>
                  ),
                  content: (
                    <>
                      Your assistants integrate with your&nbsp;brand's voice
                      and&nbsp;past content, making&nbsp;creation quick
                      and&nbsp;intuitive.
                    </>
                  ),
                },
                {
                  title: (
                    <>
                      Unified brand voice and&nbsp;content consistency across
                      all&nbsp;mediums and&nbsp;teams.
                    </>
                  ),
                  content: (
                    <>
                      Ensure your Product, Brand, Sales, and&nbsp;Success teams
                      create consistent content on&nbsp;every touchpoint.
                    </>
                  ),
                },
                {
                  title: <>Repurpose with&nbsp;purpose.</>,
                  content: [
                    <>
                      Repackage past materials into&nbsp;fresh content
                      for&nbsp;your blogs, social media, and&nbsp;product
                      documentation.
                    </>,
                    <>
                      Maximize your&nbsp;past investments and&nbsp;learnings.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [assistantExamples[0], assistantExamples[1]],
            },
          ]}
        />

        <SolutionSection
          title="Gain competitive insights."
          blocks={[
            {
              color: "pink",
              contentBlocks: {
                title: <>Set up a&nbsp;live competitive intelligence feed.</>,
                content: [
                  <>
                    Gain an edge by&nbsp;creating competitive analysis
                    assistants and&nbsp;improve your market intelligence
                    velocity and&nbsp;impact.
                  </>,
                  <>
                    Dive into&nbsp;competitors' strategies, extract insights,
                    and&nbsp;generate reports to&nbsp;inform
                    your&nbsp;decisions.
                  </>,
                ],
              },
              assistantBlocks: assistantExamples[4],
            },
          ]}
        />

        <SolutionSection
          title={
            <>
              Marketing, Sales, Product, Support&nbsp;teams, hands
              in&nbsp;hands.
            </>
          }
          blocks={[
            {
              color: "pink",
              contentBlocks: [
                {
                  title: <>Simplify collaboration across&nbsp;teams.</>,
                  content: [
                    <>
                      Create assistants to&nbsp;bridge the&nbsp;gap between
                      Marketing, Sales, Product, and&nbsp;Support.
                    </>,
                    <>
                      Translate marketing decisions, objectives,
                      and&nbsp;strategies into the&nbsp;language of
                      the&nbsp;recipient team.
                    </>,
                  ],
                },
                {
                  title: <>Level everyone’s data analysis playing field.</>,
                  content: (
                    <>
                      Point this assistant to&nbsp;CSV data with answers
                      to&nbsp;marketing and&nbsp;user surveys to&nbsp;categorize
                      answers and get&nbsp;insights.
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

Marketing.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
  {
    emoji: "🖋️",
    name: "@contentWriter",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Create content based&nbsp;on examples of&nbsp;previous similar
        best-in-class&nbsp;content
      </>
    ),
  },
  {
    emoji: "🔎",
    name: "@copyMaster",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Improve marketing copy and&nbsp;suggest new concepts to&nbsp;appeal
        to&nbsp;your&nbsp;audience
      </>
    ),
  },
  {
    emoji: "⭐️",
    name: "@marketing",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Answer any&nbsp;question about your&nbsp;team's marketing knowledge
        base. Resurface past ideas and&nbsp;create new&nbsp;ones.
      </>
    ),
  },
  {
    emoji: "🔬",
    name: "@dataAnalyzer",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Turn your questions into&nbsp;SQL queries to&nbsp;analyze user
        and&nbsp;customer&nbsp;surveys
      </>
    ),
  },
  {
    emoji: "🧐",
    name: "@competitiveIntelligence",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Synchronize your competitor websites, blogs, and&nbsp;job boards
        and&nbsp;get insights, ideas, and&nbsp;feedback to&nbsp;create
        and&nbsp;improve your market&nbsp;positioning
      </>
    ),
  },
];
