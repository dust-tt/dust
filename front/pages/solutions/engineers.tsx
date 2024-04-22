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

export default function EngineeringContent() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Engineers and Developers"
        title={<>Create a&nbsp;copilot with your&nbsp;company data</>}
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
        </H2>{" "}
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
          assistant={marketingSlides[0]}
        />
        <H2 className={defaultHClasses}>Reduce Interruptions</H2>{" "}
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
              {marketingSlides[4]}
              {marketingSlides[1]}
            </>
          }
        />
        <H2 className={defaultHClasses}>Improve Code Quality</H2>{" "}
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
              {marketingSlides[2]}
              {marketingSlides[3]}
            </>
          }
        />
      </Grid>
    </>
  );
}

EngineeringContent.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const marketingSlides = [
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
