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
      shape: getParticleShapeIndexByName(shapeNames.torus),
    },
  };
});

const defaultHClasses =
  "text-white col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3 pt-8 pb-4 text-center";

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
        <H2 className={defaultHClasses}>
          Keep your documentation
          <br />
          up-to-date.
        </H2>
        <ContentAssistantBlock
          className="col-span-12 md:col-span-8 md:col-start-3 lg:col-span-6 lg:col-start-4 xl:col-span-4 xl:col-start-5"
          layout="vertical"
          color="sky"
          content={
            <>
              <Block title={<>Documentation efficiency</>}>
                <>
                  Leverage your product and tech team's knowledge alongside
                  proven documentation and reduce the time and effort to update
                  and create new material.
                </>
              </Block>
            </>
          }
          assistant={<>{assistantExamples[0]}</>}
        />
        <H2 className={defaultHClasses}>
          Turn tickets into an opportunity for&nbsp;growth
        </H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="sky"
          content={
            <>
              <Block
                title={<>Tailor your documentation to answer unmet needs</>}
              >
                Turn user tickets into actionable insights to tailor
                documentation and training materials more closely to user
                demands.
              </Block>
              <Block
                title={<>Create a better training experience for your users</>}
              >
                Test your documentation and training scripts thanks to feedback
                assistants that behave like your users to refine your materials.
                Improve knowledge transfer.
              </Block>
            </>
          }
          assistant={
            <>
              {assistantExamples[1]}
              {assistantExamples[2]}
            </>
          }
        />
        <H2 className={defaultHClasses}>
          Improve collaboration between&nbsp;teams.
        </H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          layout="vertical"
          color="sky"
          content={
            <>
              <Block title={<>Keep your team ahead of the curve</>}>
                Dust facilitates rapid onboarding onto new subjects, enabling
                your team to quickly comprehend and create content on emerging
                topics. Fostering an environment of continuous learning.
              </Block>
              <Block title={<>Prepare for Babel's imminent end</>}>
                Foster seamless collaboration across tech, support, product and
                education teams by synchronizing everyone’s knowledge.
              </Block>
            </>
          }
          assistant={<>{assistantExamples[3]}</>}
        />
      </Grid>
    </>
  );
}

Knowledge.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export const assistantExamples = [
  <DroidItem
    key="0"
    emoji="🖋️"
    avatarBackground="bg-sky-300"
    name="@docWriter"
    question="Create documentation based on product and tech team’s knowledge."
  />,
  <DroidItem
    key="1"
    emoji="🔎"
    avatarBackground="bg-sky-300"
    name="@ticketExplorer"
    question="Explore tickets and conversations between our support team and users to extract operational knowledge worth formalizing into a document."
  />,
  <DroidItem
    key="2"
    emoji="💁"
    avatarBackground="bg-sky-300"
    name="@dearUser"
    question="A replica of our users based on detailed personae to test documentation and training scripts."
  />,
  <DroidItem
    key="3"
    emoji="🔬"
    avatarBackground="bg-sky-300"
    name="@CXquisite"
    question="Answer questions about our product, our tech, domain expertise, and training best practices."
  />,
];
