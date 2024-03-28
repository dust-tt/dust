import React from "react";

import SimpleSlider, {
  avatars,
  DroidItem,
} from "@app/components/home/carousel";
import { HeaderContentBlock } from "@app/components/home/contentBlocks";
import { Grid, H2, H4, P } from "@app/components/home/contentComponents";
import { classNames } from "@app/lib/utils";

const defaultFlexClasses = "flex flex-col gap-4";

export function ForMarketing() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Marketing Teams"
        title={
          <>
            <span className="text-pink-200">Enhance</span>
            <br />
            <span className="text-pink-400">
              Content&nbsp;Production and&nbsp;Creativity
            </span>
          </>
        }
        subtitle={
          <>
            Rapidly generate innovative ideas and high-quality&nbsp;content,
            streamlining the creative process, adapt&nbsp;content
            for&nbsp;international&nbsp;markets.
          </>
        }
      />
      <SimpleSlider slides={marketingSlides} />
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

export const marketingSlides = [
  <DroidItem
    key="1"
    avatar={avatars[1]}
    name="@contentWriter"
    question="Create content based on examples of previous similar best-in-class content."
  />,
  <DroidItem
    key="2"
    avatar={avatars[2]}
    name="@copyMaster"
    question="Improve marketing copy and suggest new concepts to appeal to your audience."
  />,
  <DroidItem
    key="3"
    avatar={avatars[3]}
    name="@marketing"
    question="Answer any question about your team's marketing knowledge base. Can help your team resurface past ideas and create new ones."
  />,
  <DroidItem
    key="5"
    avatar={avatars[5]}
    name="@dataAnalyzer"
    question="Point this assistant to CSV data with answers to marketing surveys to categorize answers and get insights."
  />,
  <DroidItem
    key="5"
    avatar={avatars[5]}
    name="@competitiveIntelligence"
    question="Synchronize your competitor websites, blogs, and job boards and get insights, ideas, and feedback to create and improve your market positioning. "
  />,
];
