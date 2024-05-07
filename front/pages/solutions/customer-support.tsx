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
        uptitle="Dust for Success and&nbsp;Support"
        title="Help your&nbsp;Support&nbsp;Teams, help&nbsp;your&nbsp;customers."
        from="from-sky-200"
        to="to-sky-500"
        subtitle="Equip your&nbsp;team with AI&nbsp;assistants to&nbsp;accelerate
            issue resolution and&nbsp;increase customer&nbsp;satisfaction."
      />
      <Grid>
        <SolutionSection
          title={<>Exceed customer&nbsp;expectations.</>}
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: (
                    <>Parse tickets and&nbsp;get to&nbsp;resolution faster</>
                  ),
                  content: [
                    <>
                      Allow agents to&nbsp;understand customer messages
                      and&nbsp;technical errors faster and&nbsp;in
                      50+&nbsp;languages.
                    </>,
                    <>
                      Build AI assistants based on&nbsp;company knowledge
                      and&nbsp;past support interactions to&nbsp;bring
                      the&nbsp;company's collective intelligence to&nbsp;the
                      support team's fingertips.
                    </>,
                  ],
                },
                {
                  title: (
                    <>Keep your&nbsp;team up-to-date at&nbsp;all&nbsp;times</>
                  ),
                  content: [
                    <>Break down information silos.</>,
                    <>
                      Give your frontline team access to&nbsp;up-to-date
                      information on&nbsp;projects, ongoing product incidents
                      or&nbsp;issues to&nbsp;help them&nbsp;take action
                      thoughtfully.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [
                assistantExamples[0],
                assistantExamples[4],
                assistantExamples[5],
              ],
            },
          ]}
        />
        <SolutionSection
          title="Elevated team collaboration."
          blocks={[
            {
              color: "sky",
              contentBlocks: [
                {
                  title: (
                    <>
                      Bring new team members
                      <br />
                      up-to-speed&nbsp;fast
                    </>
                  ),
                  content: [
                    <>
                      Reduce your&nbsp;onboarding and&nbsp;training time
                      drastically.
                    </>,
                    <>
                      Put your&nbsp;documentation on&nbsp;processes
                      and&nbsp;methods to&nbsp;work to&nbsp;help the&nbsp;team
                      learn autonomously.
                    </>,
                  ],
                },
                {
                  title: (
                    <>
                      Maintain visibility
                      <br />
                      on&nbsp;customer needs
                    </>
                  ),
                  content: [
                    <>
                      Surface insights from&nbsp;interactions with customers
                      to&nbsp;your Support, Success and&nbsp;Product teams.
                    </>,
                    <>
                      Maintain a&nbsp;continuous understanding of&nbsp;customer
                      needs to inform your&nbsp;product priorities.
                    </>,
                  ],
                },
              ],
              assistantBlocks: [assistantExamples[3], assistantExamples[2]],
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
        Surfaces relevant information from&nbsp;your Help Center, FAQs,
        knowledge base, online documentation, and&nbsp;tickets. Understands
        errors codes without help from&nbsp;the tech&nbsp;team
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
        alerts, and&nbsp;downtime
      </>
    ),
  },
  {
    emoji: "🔮",
    backgroundColor: "bg-sky-300",
    name: "@supportAnalyst",
    description: (
      <>
        Identifies patterns and&nbsp;sentiment in&nbsp;support interactions
        to&nbsp;highlight recurring needs and&nbsp;actionable initiatives based
        on&nbsp;the internal product team nomenclature and&nbsp;infrastructure
      </>
    ),
  },
  {
    emoji: "💡",
    backgroundColor: "bg-sky-300",
    name: "@supportOnboarding",
    description: (
      <>
        Helps new members of&nbsp;the support team navigate the&nbsp;tools
        and&nbsp;processes in&nbsp;their first weeks to&nbsp;set them up for
        success
      </>
    ),
  },
  {
    emoji: "🚨",
    backgroundColor: "bg-sky-300",
    name: "@supportAlerts",
    description: (
      <>
        Connects to&nbsp;product and&nbsp;engineering communication channels
        to&nbsp;surface ongoing engineering activity, incidents or&nbsp;issues
        and&nbsp;highlight the&nbsp;possible impact on&nbsp;users
        and&nbsp;customers
      </>
    ),
  },
  {
    emoji: "😳",
    backgroundColor: "bg-sky-300",
    name: "@whatWouldUserDo",
    description: (
      <>
        Crafts training, product documentation and&nbsp;training materials
        through the&nbsp;eyes of&nbsp;your users to&nbsp;help improve content
        ahead of&nbsp;issues
      </>
    ),
  },
];
