import React from "react";

import {
  Block2,
  ContentAssistantBlock,
  Conversation,
  DroidItem,
  Handle,
  HeaderContentBlock,
  Message,
} from "@app/components/home/components/contentBlocks";
import { Grid, P } from "@app/components/home/components/contentComponents";

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
      <Grid className="gap-y-8">
        <ContentAssistantBlock
          className="col-span-8"
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
          className="col-span-4 mt-12"
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
          className="col-span-8 col-start-3"
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
      <div className="col-span-10 col-start-2 grid grid-cols-6 gap-8">
        <div className="col-span-3">
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
      </div>
    </>
  );
}

export const customerSupportSlides = [
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
