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
      shape: getParticleShapeIndexByName(shapeNames.wave),
    },
  };
});

const defaultHClasses =
  "text-white col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3 pt-8 pb-4 text-center";

export default function DataAnalytics() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Data and Analyrics Teams"
        title={<>From Data to Action</>}
        from="from-amber-200"
        to="to-amber-500"
        subtitle={
          <>
            Dedicate yourself to first-of-a-kind analyses for the product and
            business while your assistants help your team with more standard
            queries and charts.
          </>
        }
      />

      <Grid>
        <H2 className={defaultHClasses}>
          Make all your team SQL fluent and Data litterate
        </H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="amber"
          content={
            <>
              <Block
                title={
                  <>
                    Package expert knowledge in easy-to-use assistants in
                    seconds
                  </>
                }
              >
                <>
                  Give your databases’ schemas, your functions, and your
                  company’s business definition to your assistant. Let your SQL
                  assistant answer your team's level one SQL questions.
                </>
              </Block>
              <Block title={<>Reduce data analysis time</>}>
                Create data assistants to turn natural language questions into
                SQL queries. Ask questions to your CSVs, Notion Database, and
                Google Spreadsheets.
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
        <H2 className={defaultHClasses}>Stop being the perpetual help desk</H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="amber"
          content={
            <>
              <Block
                title={<>Allow new team members to onboard autonomously</>}
              >
                Give new members of the data team access to continuously updated
                runbooks and internal documentation with flexible and
                pedagogical conversational assistants.
              </Block>
              <Block title={<>Talk to the data but also to the metadata</>}>
                Help everyone in the team and beyond know what fields or tables
                exist, what they mean, and how they relate to each other. Clean
                up or draft great documentation.
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

DataAnalytics.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
  <DroidItem
    key="0"
    emoji="💬"
    avatarBackground="bg-amber-300"
    name="@SQLbuddy"
    question="Your SQL copilot to generate simple queries, improve queries, and fix errors."
  />,
  <DroidItem
    key="1"
    emoji="🔬"
    avatarBackground="bg-amber-300"
    name="@userMetrics"
    question="Answer advanced questions about our users by querying our usage data."
  />,
  <DroidItem
    key="2"
    emoji="📈"
    avatarBackground="bg-amber-300"
    name="@data"
    question="Answer questions about the process, runbooks, and documentation of the data team."
  />,
  <DroidItem
    key="3"
    emoji="📚"
    avatarBackground="bg-amber-300"
    name="@rolodex"
    question="Your data Rolodex to know everything about data and metadata at the company."
  />,
];
