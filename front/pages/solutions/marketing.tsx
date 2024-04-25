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
      shape: getParticleShapeIndexByName(shapeNames.pyramid),
    },
  };
});

const defaultHClasses =
  "text-white col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3 pt-8 pb-4 text-center";

export default function Marketing() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Marketing Teams"
        title={
          <>
            Enhance
            <br />
            Content&nbsp;Production and&nbsp;Creativity
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
        <H2 className={defaultHClasses}>
          Create better content,
          <br />
          faster and on-brand
        </H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="pink"
          content={
            <>
              <Block
                title={
                  <>
                    Accelerate your content generation across blogs, websites,
                    and social media.
                  </>
                }
              >
                <>
                  Your assistants integrate with your brand's voice and past
                  content, making creation quick and intuitive.
                </>
              </Block>
              <Block
                title={
                  <>
                    Unified brand voice and content consistency across all
                    mediums and teams
                  </>
                }
              >
                Ensure your Product, Brand, Sales, and Success teams create
                consistent content on every touchpoint.
              </Block>
            </>
          }
          assistant={assistantExamples[0]}
        />
        <H2 className={defaultHClasses}>
          Gain Competitive Insights, Repurpose With Purpose
        </H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="pink"
          content={
            <>
              <Block title={<>Set up a live competitive intelligence feed</>}>
                Gain an edge by creating competitive analysis assistants and
                improve your market intelligence velocity and impact. Dive into
                competitors' strategies, extract insights, and generate reports
                to inform your decisions.
              </Block>
              <Block title={<>Repurpose and repackage past content.</>}>
                Transform past materials into fresh content for your blogs,
                social media, and product documentation. Maximize your past
                investments and learnings.
              </Block>
            </>
          }
          assistant={
            <>
              {assistantExamples[4]}
              {assistantExamples[1]}
            </>
          }
        />
        <H2 className={defaultHClasses}>
          Better collaboration with Sales, Product, and Support teams.
        </H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="pink"
          content={
            <>
              <Block title={<>Simplify collaboration across teams.</>}>
                Create assistants to bridge the gap between Marketing, Sales,
                Product, and Support, translating marketing decisions,
                objectives, and strategies into the language of the recipient
                team.
              </Block>
              <Block
                title={<>Level everyone’s data analysis playing field. </>}
              >
                Point this assistant to CSV data with answers to marketing and
                user surveys to categorize answers and get insights.
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

Marketing.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
  <DroidItem
    key="0"
    emoji="🖋️"
    avatarBackground="bg-pink-300"
    name="@contentWriter"
    question="Create content based on examples of previous similar best-in-class content."
  />,
  <DroidItem
    key="1"
    emoji="🔎"
    avatarBackground="bg-pink-300"
    name="@copyMaster"
    question="Improve marketing copy and suggest new concepts to appeal to your audience."
  />,
  <DroidItem
    key="2"
    emoji="⭐️"
    avatarBackground="bg-pink-300"
    name="@marketing"
    question="Answer any question about your team's marketing knowledge base. Can help your team resurface past ideas and create new ones."
  />,
  <DroidItem
    key="3"
    emoji="🔬"
    avatarBackground="bg-pink-300"
    name="@dataAnalyzer"
    question="Turn your questions into SQL queries to analyze user and customer surveys."
  />,
  <DroidItem
    key="4"
    emoji="🧐"
    avatarBackground="bg-pink-300"
    name="@competitiveIntelligence"
    question="Synchronize your competitor websites, blogs, and job boards and get insights, ideas, and feedback to create and improve your market positioning. "
  />,
];
