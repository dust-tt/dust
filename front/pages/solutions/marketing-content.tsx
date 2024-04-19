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

export default function MarketingContent() {
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
        from="from-pink-300"
        to="to-red-400"
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
        </H2>{" "}
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="sky"
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
        <H2 className={defaultHClasses}>
          Gain Competitive Insights, Repurpose With Purpose
        </H2>{" "}
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
        {/* OLD STUFF */}
        <ContentAssistantBlock
          className="col-span-10 col-start-2"
          color="sky"
          content={
            <>
              <Block title="Faster content creation">
                Accelerate your content generation across blogs, websites, and
                social media with Dust assistants. Your AI assistants seamlessly
                integrate with your brand's voice and past content, making
                creation quick and intuitive.
              </Block>
              <Block title="More consistency">
                Create assistants to help everyone maintain a unified brand
                voice and content consistency across all mediums and teams
                autonomously. Dust helps your marketing ensure your Product,
                Brand, Sales, and Success create consistent content whatever the
                touchpoint.
              </Block>
              <Block title="Repurpose and repackage past content">
                Maximize the value of your existing content. With Dust,
                effortlessly transform past materials into fresh content for
                your blogs, social media and product documentation, ensuring you
                make the most of your past investments and learnings.
              </Block>
            </>
          }
          assistant=<>
            {marketingSlides[0]}
            {marketingSlides[1]}
          </>
        />
        <ContentAssistantBlock
          className="col-span-6"
          layout="vertical"
          color="amber"
          content={
            <>
              <Block title="Better competitive intelligence">
                Gain an edge by creating competitive analysis assistants and
                improve your market intelligence velocity and impact. Dive deep
                into competitors' strategies, extract actionable insights based
                on defined frameworks, and generate automated reports to inform
                your strategy and decisions.
              </Block>
            </>
          }
          assistant={
            <>
              {marketingSlides[3]}
              {marketingSlides[4]}
            </>
          }
        />
        <ContentAssistantBlock
          className="col-span-6"
          layout="vertical"
          color="emerald"
          content={
            <>
              <Block title="Faster on-boarding">
                Streamline the integration of new marketing team members with
                Dust. Create AI assistants to provide instant access to your
                marketing workflows, speeding up the learning curve and
                enhancing productivity.
              </Block>
              <Block title="Better collaboration with Sales, Product and Support teams">
                Enhance cross-team collaboration effortlessly. Dust help you
                create AI assistants to bridge the gap between Marketing, Sales,
                Product, and Support, translating marketing decisions,
                objectives and strategies into the language of the recipient
                team.
              </Block>
            </>
          }
          assistant={marketingSlides[2]}
        />
      </Grid>
    </>
  );
}

MarketingContent.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const marketingSlides = [
  <DroidItem
    key="0"
    emoji="🖋️"
    avatarBackground="bg-sky-200"
    name="@contentWriter"
    question="Create content based on examples of previous similar best-in-class content."
  />,
  <DroidItem
    key="1"
    emoji="🔎"
    avatarBackground="bg-pink-200"
    name="@copyMaster"
    question="Improve marketing copy and suggest new concepts to appeal to your audience."
  />,
  <DroidItem
    key="2"
    emoji="⭐️"
    avatarBackground="bg-emerald-200"
    name="@marketing"
    question="Answer any question about your team's marketing knowledge base. Can help your team resurface past ideas and create new ones."
  />,
  <DroidItem
    key="3"
    emoji="🔬"
    avatarBackground="bg-amber-200"
    name="@dataAnalyzer"
    question="Point this assistant to CSV data with answers to marketing surveys to categorize answers and get insights."
  />,
  <DroidItem
    key="4"
    emoji="🧐"
    avatarBackground="bg-pink-200"
    name="@competitiveIntelligence"
    question="Synchronize your competitor websites, blogs, and job boards and get insights, ideas, and feedback to create and improve your market positioning. "
  />,
];
