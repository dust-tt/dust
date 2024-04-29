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
        uptitle="Dust for Success and&nbsp;Support&nbsp;Teams"
        title="Help your Success and&nbsp;Support&nbsp;Teams, help&nbsp;your&nbsp;customers."
        from="from-sky-200"
        to="to-sky-500"
        subtitle="Equip your&nbsp;team with AI&nbsp;assistants to&nbsp;accelerate
            issue resolution and&nbsp;increase customer&nbsp;satisfaction."
      />
      <Grid>
        <SolutionSection
          title={
            <>
              Elevate Support,
              <br />
              exceed Customer&nbsp;expectations.
            </>
          }
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: "Keep your team spot-on.",
                  content: [
                    <>
                      Help them parse customer inquiries faster,
                      leveraging&nbsp;past tickets and&nbsp;the&nbsp;latest
                      information on&nbsp;product updates
                      or&nbsp;downtime&nbsp;alerts.
                    </>,
                    <>All in&nbsp;50+&nbsp;languages.</>,
                  ],
                },
                {
                  title: <>Analyze and&nbsp;categorize your&nbsp;tickets.</>,
                  content: [
                    <>Classify tickets along your&nbsp;internal priorities.</>,
                    <>
                      Help your Support, Success and&nbsp;Product teams better
                      understand your users'&nbsp;needs.
                    </>,
                  ],
                },
              ],
              assistantBlocks: assistantExamples[0],
            },
          ]}
        />
        <SolutionSection
          title="Better team collaboration."
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: "Onboard faster.",
                  content:
                    "Reduce your onboarding and&nbsp;training time drastically. Put your documentation on&nbsp;processes and&nbsp;methods to&nbsp;work.",
                },
                {
                  title: "Keep your team updated.",
                  content: (
                    <>
                      Understand customer messages faster, and&nbsp;technical
                      errors in&nbsp;any language. Explore past tickets
                      to&nbsp;resolve issues or create
                      documentation&nbsp;quickly.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[3], assistantExamples[1]],
            },
          ]}
        />
        <SolutionSection
          title="Better insights."
          blocks={[
            {
              color: "sky",
              contentBlocks: {
                title: "Analyze and&nbsp;categorize your ticket",
                content: [
                  <>Classify your tickets using Dust Apps.</>,
                  <>
                    Help your Customer Support and&nbsp;Product team better
                    understand your&nbsp;users' needs.
                  </>,
                ],
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
    description: (
      <>
        Surface best information from&nbsp;your Help Center, FAQs, knowledge
        base, online documentation, and&nbsp;tickets. Understand errors codes
        without help from&nbsp;the Tech&nbsp;team.
      </>
    ),
  },
  {
    emoji: "📡",
    backgroundColor: "bg-sky-300",
    name: "@productInfo",
    description: (
      <>
        Answer questions on&nbsp;product evolutions, engineering activity,
        alerts, and&nbsp;downtime.
      </>
    ),
  },
  {
    emoji: "🔮",
    backgroundColor: "bg-sky-300",
    name: "@ticketAnalyst",
    description: (
      <>
        Classify tickets; identify patterns, sentiment,
        and&nbsp;recurring&nbsp;needs.
      </>
    ),
  },
  {
    emoji: "💡",
    backgroundColor: "bg-sky-300",
    name: "@onboardingBuddy",
    description: (
      <>All you need to&nbsp;know about people, tooling and&nbsp;resources.</>
    ),
  },
];
