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
        title={
          <>
            Give life
            <br />
            to your knowledge
          </>
        }
        from="from-sky-200"
        to="to-sky-500"
        subtitle={
          <>
            Make your content discoverable, accessible, truely actionable.
            <br />
            Speed up content creation, identify uncovered documentation needs.
          </>
        }
      />

      <Grid>
        <SolutionSection
          title={
            <>
              Keep your documentation
              <br />
              up-to-date.
            </>
          }
          blocks={[
            {
              color: "sky",
              contentBlocks: {
                title: <>Documentation efficiency</>,
                content: (
                  <>
                    Leverage your product and&nbsp;tech team's knowledge
                    alongside proven documentation and&nbsp;reduce the time
                    and&nbsp;effort to&nbsp;update and&nbsp;create new material.
                  </>
                ),
              },
              assistantBlocks: assistantExamples[0],
            },
          ]}
        />
        <SolutionSection
          title={<>Turn tickets into an opportunity for&nbsp;growth</>}
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: (
                    <>Tailor your documentation to&nbsp;answer unmet needs</>
                  ),
                  content: (
                    <>
                      Turn user tickets into&nbsp;actionable insights
                      to&nbsp;tailor documentation and&nbsp;training materials
                      more closely to&nbsp;user demands.
                    </>
                  ),
                },
                {
                  title: (
                    <>Create a better training experience for&nbsp;your users</>
                  ),
                  content: (
                    <>
                      Test your documentation and&nbsp;training scripts thanks
                      to&nbsp;feedback assistants that behave like
                      your&nbsp;users to&nbsp;refine your materials. Improve
                      knowledge transfer.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[1], assistantExamples[2]],
            },
          ]}
        />
        <SolutionSection
          title={<>Improve collaboration between&nbsp;teams.</>}
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: <>Keep your team ahead of the curve</>,
                  content: (
                    <>
                      Dust facilitates rapid onboarding onto new subjects,
                      enabling your team to&nbsp;quickly comprehend
                      and&nbsp;create content on&nbsp;emerging topics. Fostering
                      an environment of continuous learning.
                    </>
                  ),
                },
                {
                  title: <>Prepare for Babel's imminent end</>,
                  content: (
                    <>
                      Foster seamless collaboration across tech, support,
                      product and&nbsp;education teams by synchronizing
                      everyone’s knowledge.
                    </>
                  ),
                },
              ],
              assistantBlocks: [assistantExamples[3]],
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
    name: "@docWriter",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Create documentation based&nbsp;on product and&nbsp;tech team's
        knowledge.
      </>
    ),
  },
  {
    emoji: "🔎",
    name: "@ticketExplorer",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Explore tickets and&nbsp;conversations between our support team
        and&nbsp;users to&nbsp;extract operational knowledge worth formalizing
        into&nbsp;a document.
      </>
    ),
  },
  {
    emoji: "💁",
    name: "@dearUser",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        A replica of our users based&nbsp;on detailed personae to&nbsp;test
        documentation and&nbsp;training scripts.
      </>
    ),
  },
  {
    emoji: "🔬",
    name: "@CXquisite",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Answer questions about our product, our tech, domain expertise,
        and&nbsp;training best practices.
      </>
    ),
  },
];
