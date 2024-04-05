import React from "react";

import {
  Avatars3D,
  Block2,
  ContentAssistantBlock,
  Conversation,
  DroidItem,
  Handle,
  HeaderContentBlock,
  Message,
} from "@app/components/home/components/contentBlocks";
import { Grid, H1, P } from "@app/components/home/components/contentComponents";
import { classNames } from "@app/lib/utils";

const defaultFlexClasses = "flex flex-col gap-4";

export function ForCustomerSupport() {
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
        <ContentAssistantBlock
          className="col-span-8 col-start-3"
          color="sky"
          content={
            <>
              <Block2 title="Package expert knowledge in easy to use assistants in seconds">
                Build AI assistants based on company knowledge and past support
                conversations.
              </Block2>
              <Block2 title="Understand problems faster, jump to solutions">
                Understand customer messages faster, in any language. Find
                informations to resolve issues quickly with semantic search and
                access to cross company data.
              </Block2>
            </>
          }
          assistant={customerSupportSlides[0]}
        />
        <ContentAssistantBlock
          className="col-span-4"
          color="pink"
          content={
            <>
              <Block2
                title="Stay connected to the rest of the company"
                className="col-span-6"
              >
                Release schedule, technical outage, program maitenance, all
                accessible in one place.
              </Block2>
            </>
          }
          assistant={customerSupportSlides[2]}
        />
        <ContentAssistantBlock
          className="col-span-8"
          color="emerald"
          content={
            <>
              <Block2
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
              </Block2>
            </>
          }
          assistant={
            <>
              {customerSupportSlides[1]}
              {customerSupportSlides[3]}
            </>
          }
        />
      </Grid>
      <Grid>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-5"
          )}
        >
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
        </div>
      </Grid>
      <Grid>
        <H1 className="col-span-12 text-center text-white">
          Links to Blog articles around Marketing use cases
        </H1>
      </Grid>
      <Grid>
        <H1 className="col-span-12 text-center text-white">
          Structured referal specific to Marketing
          <br />
          (post from our users, quotes)
        </H1>
      </Grid>
    </>
  );
}

export const customerSupportSlides = [
  <DroidItem
    key="1"
    avatar={Avatars3D[1]}
    name="@supportExpert"
    category="Support"
    question="Surface best information from your Help Center, FAQs, knowledge base, online documentation, and tickets.  Understand errors codes without help from the tech team."
  />,
  <DroidItem
    key="2"
    avatar={Avatars3D[2]}
    name="@customerWrite"
    category="Support"
    question="Draft answers using company tone and voice, support guidelines, and customer messages."
  />,
  <DroidItem
    key="3"
    avatar={Avatars3D[3]}
    name="@productInfo"
    category="Support"
    question="Answer questions on product evolutions, engineering activity, alerts, and downtime."
  />,
  <DroidItem
    key="4"
    avatar={Avatars3D[5]}
    name="@followUpScenario"
    category="Support"
    question="Help anticipate further requests from users and ensure those are covered before answering to a customer."
  />,
];
