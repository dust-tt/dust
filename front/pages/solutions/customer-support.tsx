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
      shape: getParticleShapeIndexByName(shapeNames.octahedron),
    },
  };
});

export default function CustomerSupport() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Customer Support"
        title={
          <>
            Help your Support&nbsp;Team,
            <br />
            help your&nbsp;customers.
          </>
        }
        from="from-sky-200"
        to="to-sky-500"
        subtitle={
          <>
            Reply faster and increase answer&nbsp;quality
            <br />
            by augmenting your&nbsp;Customer&nbsp;Support with
            AI&nbsp;assistants.
          </>
        }
      />
      <Grid>
        <SolutionSection
          title={
            <>
              Happy Agents,
              <br />
              happy Customers
            </>
          }
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: (
                    <>
                      Package expert knowledge in easy to use assistants in
                      seconds
                    </>
                  ),
                  content:
                    "Build AI assistants based on company knowledge and past support",
                },
                {
                  title: <>Leverage past tickets and jump to solutions</>,
                  content: (
                    <>
                      Understand customer messages faster, and technical errors
                      in any language. Explore past tickets to resolve issues or
                      create documentation quickly.
                    </>
                  ),
                },
              ],
              assistantBlocks: assistantExamples[0],
            },
          ]}
        />
        <SolutionSection
          title={<>Better team collaboration</>}
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: <>Onboard faster</>,
                  content:
                    "Reduce your onboarding and training time drastically. Put your documentation on processes and methods to work.",
                },
                {
                  title: <>Keep your team updated</>,
                  content: (
                    <>
                      Understand customer messages faster, and technical errors
                      in any language. Explore past tickets to resolve issues or
                      create documentation quickly.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[3], assistantExamples[1]],
            },
          ]}
        />
        <SolutionSection
          title={<>Better insights</>}
          blocks={[
            {
              color: "sky",
              contentBlocks: {
                title: <>Analyze and categorize your ticket</>,
                content: (
                  <>
                    Understand customer messages faster, and technical errors in
                    any language. Explore past tickets to resolve issues or
                    create documentation quickly.
                  </>
                ),
              },

              assistantBlocks: assistantExamples[2],
            },
          ]}
        />
      </Grid>
    </>
  );
}

CustomerSupport.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
  {
    emoji: "🤝",
    backgroundColor: "bg-sky-300",
    name: "@supportExpert",
    description:
      "Surface best information from your Help Center, FAQs, knowledge base, online documentation, and tickets.  Understand errors codes without help from the tech team.",
  },
  {
    emoji: "📡",
    backgroundColor: "bg-sky-300",
    name: "@productInfo",
    description:
      "Answer questions on product evolutions, engineering activity, alerts, and downtime.",
  },
  {
    emoji: "🔮",
    backgroundColor: "bg-sky-300",
    name: "@ticketAnalyst",
    description:
      "Classify tickets; identify patterns, sentiment, and recurring needs.",
  },
  {
    emoji: "💡",
    backgroundColor: "bg-sky-300",
    name: "@onboardingBuddy",
    description: "All you need to know about people, tooling and resources.",
  },
];
