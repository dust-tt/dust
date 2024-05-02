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

export default function Knowledge() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Knowledge Management"
        title={<>Bring your&nbsp;internal knowledge to&nbsp;life</>}
        from="from-sky-200"
        to="to-sky-500"
        subtitle={
          <>
            Keep internal content fresh, discoverable and&nbsp;truly useful.
            <br />
            Make it&nbsp;easy for teams to&nbsp;work smarter by&nbsp;tapping
            into the&nbsp;company's collective intelligence and&nbsp;expertise.
          </>
        }
      />

      <Grid>
        <SolutionSection
          title={
            <>
              Keep internal documentation
              <br />
              up-to-date.
            </>
          }
          blocks={[
            {
              color: "sky",
              contentBlocks: {
                title: <>Keep company knowledge fresh with minimal effort</>,
                content: (
                  <>
                    Leverage your&nbsp;team's discussions and&nbsp;knowledge
                    to&nbsp;reduce the&nbsp;time and&nbsp;lift required
                    to&nbsp;update and&nbsp;create new content. Compare
                    and&nbsp;contrast existing documentation to&nbsp;highlight
                    areas in&nbsp;need of&nbsp;a revision.
                  </>
                ),
              },
              assistantBlocks: [
                assistantExamples[0],
                assistantExamples[1],
                assistantExamples[2],
              ],
            },
          ]}
        />
        <SolutionSection
          title={<>Upgrade internal communication and&nbsp;collaboration.</>}
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: <>Onboard at&nbsp;breakneck speed</>,
                  content: (
                    <>
                      Generate tailored onboarding experiences for newcomers
                      based on&nbsp;their skills and&nbsp;set them up for
                      success with personalized onboarding coaching. Create
                      the&nbsp;infrastructure for the&nbsp;future
                      of&nbsp;continuous learning.
                    </>
                  ),
                },
                {
                  title: <>Tear down knowledge walls</>,
                  content: (
                    <>
                      Keep the&nbsp;company hive mind ahead of&nbsp;the curve
                      with answers to&nbsp;general questions about any function
                      or&nbsp;team. Foster collaboration across teams
                      by&nbsp;freeing content from&nbsp;the software silos
                      it&nbsp;lives in. Give teams the&nbsp;tools
                      to&nbsp;translate internal news into the&nbsp;language
                      they understand.
                    </>
                  ),
                },
              ],
              assistantBlocks: [
                assistantExamples[3],
                assistantExamples[4],
                assistantExamples[5],
              ],
            },
          ]}
        />
      </Grid>
    </>
  );
}

Knowledge.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
  {
    emoji: "🖋️",
    name: "@docsNew",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Create documentation based on&nbsp;product and&nbsp;tech team's
        knowledge
      </>
    ),
  },
  {
    emoji: "🔬",
    name: "@docsUpdate",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Analyze existing documentation in&nbsp;the context of&nbsp;internal
        discussions on&nbsp;product launches to&nbsp;highlight update
        requirements
      </>
    ),
  },
  {
    emoji: "🔎",
    name: "@docsFromTickets",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Explore support tickets and&nbsp;support team conversations to&nbsp;spot
        operational knowledge that should be&nbsp;formalized into
        a&nbsp;document
      </>
    ),
  },
  {
    emoji: "🚀",
    name: "@First90Days",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Quizzes new team members on&nbsp;company knowledge as&nbsp;they onboard
        on&nbsp;their specific team
      </>
    ),
  },
  {
    emoji: "🧑‍🍳",
    name: "@LikeImAnEngineer",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Translates internal memos focusing on&nbsp;the technical implications
        and&nbsp;providing reminders on&nbsp;certain business priorities
      </>
    ),
  },
  {
    emoji: "👨‍🎤",
    name: "@LikeImOnSales",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Explains technical concepts in&nbsp;the context of&nbsp;the company's
        infrastructure and&nbsp;data model
      </>
    ),
  },
];
