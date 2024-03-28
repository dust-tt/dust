import React from "react";

import SimpleSlider, {
  avatars,
  DroidItem,
} from "@app/components/home/carousel";
import { Grid, H2, H3, H4, P } from "@app/components/home/contentComponents";
import { classNames } from "@app/lib/utils";

const defaultFlexClasses = "flex flex-col gap-4";

export function CustomerSupportPage() {
  return (
    <>
      <Grid>
        <div
          className={classNames(
            "flex min-h-[50vh] flex-col justify-end gap-8",
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-9 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <P size="lg">Dust for Customer Support</P>
          <div className="h-4" />
          <H2 className="text-sky-400">
            Happy Support&nbsp;team,
            <br />
            <span className="text-white">happy customers, at&nbsp;scale.</span>
          </H2>
          <H3 className="text-white">
            Reply faster and increase answer quality
            <br />
            with augmenting your&nbsp;Customer&nbsp;Support.
          </H3>
        </div>
      </Grid>
      <SimpleSlider slides={customerSupportSlides} />
      <Grid>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-8 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H2 className="text-amber-500">
            Help your agents
            <br />
            <span className="text-amber-200">help your customers</span>
          </H2>
          <P size="md">
            Reply faster and increase answer quality by{" "}
            <strong>augmenting your&nbsp;Customer&nbsp;Support.</strong>
          </P>
          <H4 className="text-white">
            {" "}
            Package expert knowledge in easy to use assistants in seconds
          </H4>
          <P size="md">
            Build AI assistants based on company knowledge and past support
            conversations.
          </P>
          <H4 className="text-white">
            {" "}
            Understand problems faster, jump to solutions
          </H4>
          <P size="md">
            Understand customer messages faster, in any language. Find
            informations to resolve issues quickly with semantic search and
            access to cross company data.
          </P>
          <H4 className="text-white">
            {" "}
            Stay connected to the rest of the company
          </H4>
          <P size="md">
            release schedule, technical outage, program maitenance, all
            accessible in one place.
          </P>
          <H4 className="text-white"> Write better answers, faster</H4>
          <P size="md">
            Draft and correct answers following company guidelines and tone of
            voice in seconds.
          </P>
        </div>
      </Grid>
    </>
  );
}

export const customerSupportSlides = [
  <DroidItem
    key="1"
    avatar={avatars[1]}
    name="@supportExpert"
    question="Surface best information from your Help Center, FAQs, knowledge base, online documentation, and tickets.  Understand errors codes without help from the tech team."
  />,
  <DroidItem
    key="2"
    avatar={avatars[2]}
    name="@customerWrite"
    question="Draft answers using company tone and voice, support guidelines, and customer messages."
  />,
  <DroidItem
    key="3"
    avatar={avatars[3]}
    name="@productInfo"
    question="Answer questions on product evolutions, engineering activity, alerts, and downtime."
  />,
  <DroidItem
    key="5"
    avatar={avatars[5]}
    name="@followUpScenario"
    question="Help anticipate further requests from users and ensure those are covered before answering to a customer."
  />,
];
