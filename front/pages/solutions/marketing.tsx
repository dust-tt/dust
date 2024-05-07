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
        uptitle="Dust for Marketing"
        title={<>Enhance Content Production and&nbsp;Creativity</>}
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
              faster and&nbsp;on-brand
            </>
          }
          blocks={[
            {
              color: "pink",
              contentBlocks: [
                {
                  title: <>Consistent content at&nbsp;last</>,
                  content: (
                    <>
                      Uses assistants to&nbsp;ensure consistency across teams
                      and&nbsp;customer touchpoints. Leverage
                      your&nbsp;carefully crafted brand voice guidelines
                      and&nbsp;past content to&nbsp;support a&nbsp;quick
                      and&nbsp;intuitive creative process.
                    </>
                  ),
                },
                {
                  title: <>Cross-posting made easy</>,
                  content: (
                    <>
                      Generate inspired and&nbsp;aligned versions of&nbsp;your
                      content adapted to&nbsp;blogs, websites, product
                      documentation, and&nbsp;social media faster.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[0], assistantExamples[1]],
            },
          ]}
        />

        <SolutionSection
          title={<>AI Power-ups for&nbsp;each team and&nbsp;on&nbsp;demand</>}
          blocks={[
            {
              color: "pink",
              contentBlocks: [
                {
                  title: <>Set up a&nbsp;live competitive intelligence feed</>,
                  content: [
                    <>
                      Leverage AI assistants to&nbsp;keep tabs on&nbsp;your
                      market and&nbsp;its participants.
                    </>,
                    <>
                      Generate reports on&nbsp;competitors' moves to&nbsp;never
                      be&nbsp;caught off-guard and&nbsp;inform
                      your&nbsp;decisions.
                    </>,
                  ],
                },
                {
                  title: <>Man the&nbsp;battle card stations</>,
                  content: [
                    <>
                      Bridge the&nbsp;gap with Sales, Product, and&nbsp;Support
                      teams by&nbsp;translating marketing decisions, objectives,
                      and&nbsp;strategies into their&nbsp;language.
                    </>,
                    <>
                      Easily generate content and&nbsp;insights leveraging
                      competitive intelligence and&nbsp;the positioning you've
                      decided on.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [
                assistantExamples[4],
                assistantExamples[3],
                assistantExamples[5],
              ],
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
        Creates content based on best-in class &nbsp;examples availble
        internally
      </>
    ),
  },
  {
    emoji: "🖇️",
    name: "@crossPost",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Generates versioned&nbsp;content for social media outlets taking into
        account company guidelines
      </>
    ),
  },
  {
    emoji: "⭐️",
    name: "@marketing",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Answer any question about your&nbsp;team's marketing knowledge base.
        Resurface past ideas and&nbsp;create new ones
      </>
    ),
  },
  {
    emoji: "🔬",
    name: "@dataInsights",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Analyzes user and&nbsp;customer surveys quantitatively based
        on&nbsp;your natural language questions
      </>
    ),
  },
  {
    emoji: "🧐",
    name: "@competitive",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Tracks competitors websites to highlight changes and pro-actively detect
        market positioning opportunities
      </>
    ),
  },
  {
    emoji: "♠️",
    name: "@battleCard",
    backgroundColor: "bg-pink-300",
    description: (
      <>
        Generates arguments for your product in comparison to a specific
        competitor, in line with internal product guidelines and category
        positioning.
      </>
    ),
  },
];
