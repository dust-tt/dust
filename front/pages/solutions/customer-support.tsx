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
    props: { gaTrackingId: config.getGaTrackingId(), shape: 9 },
  };
});

const defaultHClasses =
  "text-white col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3";

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
        from="from-sky-300"
        to="to-blue-500"
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
        <H2 className={defaultHClasses}>
          Happy Agents,
          <br />
          happy Customers.
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
                    Package expert knowledge in easy to use assistants in
                    seconds
                  </>
                }
              >
                Build AI assistants based on company knowledge and past support
                conversations.
              </Block>
              <Block title={<>Leverage past tickets and jump to solutions</>}>
                Understand customer messages faster, and technical errors in any
                language. Explore past tickets to resolve issues or create
                documentation quickly.
              </Block>
            </>
          }
          assistant={customerSupportSlides[0]}
        />
        <H2 className={defaultHClasses}>Better team collaboration.</H2>
        <ContentAssistantBlock
          className="col-span-12 lg:col-span-10 lg:col-start-2 xl:col-span-8 xl:col-start-3"
          color="emerald"
          layout="vertical"
          content={
            <>
              <Block title={<>Onboard faster</>} className="col-span-6">
                Reduce your onboarding and training time drastically. Put your
                documentation on processes and methods to work.
              </Block>
              <Block title={<>Keep your team updated</>}>
                Understand customer messages faster, and technical errors in any
                language. Explore past tickets to resolve issues or create
                documentation quickly.
              </Block>
            </>
          }
          assistant={
            <>
              {customerSupportSlides[3]}
              {customerSupportSlides[1]}
            </>
          }
        />
        <H2 className={defaultHClasses}>Better insights.</H2>
        <ContentAssistantBlock
          className="col-span-12 md:col-span-8 lg:col-span-6 lg:col-start-2 xl:col-span-5 xl:col-start-3"
          color="pink"
          layout="vertical"
          content={
            <>
              <Block title={<>Analyze and categorize your tickets.</>}>
                Create a Dust App to classify your tickets. Help your Customer
                Support and Product team better understand your users’ needs.
              </Block>
            </>
          }
          assistant={<>{customerSupportSlides[2]}</>}
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

const customerSupportSlides = [
  <DroidItem
    key={0}
    emoji="🤝"
    avatarBackground="bg-sky-200"
    name="@supportExpert"
    question="Surface best information from your Help Center, FAQs, knowledge base, online documentation, and tickets.  Understand errors codes without help from the tech team."
  />,
  <DroidItem
    key={1}
    emoji="📡"
    avatarBackground="bg-emerald-200"
    name="@productInfo"
    question="Answer questions on product evolutions, engineering activity, alerts, and downtime."
  />,
  <DroidItem
    key={2}
    emoji="🔮"
    avatarBackground="bg-pink-200"
    name="@ticketAnalyst"
    question="@ticketAnalyst
    Classify tickets; identify patterns, sentiment, and recurring needs. "
  />,
  <DroidItem
    key={3}
    emoji="💡"
    avatarBackground="bg-emerald-200"
    name="@onboardingBuddy"
    question="All you need to know about people, tooling and resources."
  />,
];
