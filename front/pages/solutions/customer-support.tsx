import type { ReactElement } from "react";

import {
  Block,
  ContentAssistantBlock,
  DroidItem,
  HeaderContentBlock,
} from "@app/components/home/new/ContentBlocks";
import { Grid } from "@app/components/home/new/ContentComponents";
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
      <Grid gap="gap-8">
        <ContentAssistantBlock
          className="col-span-8"
          layout="vertical"
          color="sky"
          content={
            <>
              <Block title="Package expert knowledge in easy to use assistants in seconds">
                Build AI assistants based on company knowledge and past support
                conversations.
              </Block>
              <Block title="Understand problems faster, jump to solutions">
                Understand customer messages faster, in any language. Find
                informations to resolve issues quickly with semantic search and
                access to cross company data.
              </Block>
            </>
          }
          assistant={customerSupportSlides[0]}
        />
        <ContentAssistantBlock
          className="col-span-4"
          color="pink"
          layout="vertical"
          content={
            <>
              <Block
                title="Stay connected to the rest of the company"
                className="col-span-6"
              >
                Release schedule, technical outage, program maitenance, all
                accessible in one place.
              </Block>
            </>
          }
          assistant={customerSupportSlides[2]}
        />
        <ContentAssistantBlock
          className="col-span-8 col-start-3"
          color="emerald"
          layout="vertical"
          content={
            <>
              <Block
                title={
                  <>
                    Write better answers,
                    <br />
                    faster
                  </>
                }
              >
                Draft and correct answers following company guidelines and tone
                of voice in&nbsp;seconds.
              </Block>
            </>
          }
          assistant={
            <>
              {customerSupportSlides[1]}
              {customerSupportSlides[3]}
            </>
          }
        />
        {/* <div className="col-span-4">
          <Conversation>
            <Message
              type="user"
              name="Jessica Parker"
              visual="static/humanavatar/human14.jpg"
            >
              <P size="sm">
                <Handle>@supportExpert</Handle> how do we manage downgrade a
                subscription to a less expensive option halfway through the
                term?
              </P>
            </Message>
            <Message
              type="agent"
              name="@supportExpert"
              visual="https://dust.tt/static/droidavatar/Droid_Yellow_4.jpg"
            >
              <P size="sm">
                We allow for changes, but there is a 10% fee associated with
                downgrading before the term ends.
              </P>
              <P size="sm">The process is the following:</P>
              <P size="sm">…</P>
            </Message>
            <Message
              type="user"
              name="Jessica Parker"
              visual="static/humanavatar/human14.jpg"
            >
              <P size="sm">
                <Handle>@customerWrite</Handle>, the customer is called Cedric.
                Please draft an email answer explaining the 10% fee on 3 months
                remaining to the subscription.
              </P>
            </Message>
            <Message
              type="agent"
              name="@customerWrite"
              visual="https://dust.tt/static/droidavatar/Droid_Red_4.jpg"
            >
              <P size="sm">Subject: Your Subscription Change Request</P>
              <P size="sm">Dear Cedric, </P>
              <P size="sm">
                I hope this message finds you well. You've expressed an interest
                in downgrading your current subscription plan before the end of
                its term. We appreciate your continued support and are here to
                assist you with your request.
              </P>
              <P size="sm">…</P>
            </Message>
          </Conversation>
        </div> */}
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
    key="1"
    emoji="🤝"
    avatarBackground="bg-sky-200"
    name="@supportExpert"
    question="Surface best information from your Help Center, FAQs, knowledge base, online documentation, and tickets.  Understand errors codes without help from the tech team."
  />,
  <DroidItem
    key="2"
    emoji="🖋️"
    avatarBackground="bg-emerald-200"
    name="@customerWriter"
    question="Draft answers using company tone and voice, support guidelines, and customer messages."
  />,
  <DroidItem
    key="3"
    emoji="📡"
    avatarBackground="bg-pink-200"
    name="@productInfo"
    question="Answer questions on product evolutions, engineering activity, alerts, and downtime."
  />,
  <DroidItem
    key="4"
    emoji="🔮"
    avatarBackground="bg-emerald-200"
    name="@followUpScenario"
    question="Help anticipate further requests from users and ensure those are covered before answering to a customer."
  />,
];
