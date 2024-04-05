import React from "react";

import { avatars, DroidItem } from "@app/components/home/components/carousel";
import {
  Block,
  HeaderContentBlock,
} from "@app/components/home/components/contentBlocks";
import { Grid, H1 } from "@app/components/home/components/contentComponents";
import { classNames } from "@app/lib/utils";

const defaultFlexClasses = "flex flex-col gap-4";

export function ForMarketing() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Marketing Teams"
        title={
          <>
            Enhance
            <br />
            Content&nbsp;Production and&nbsp;Creativity
          </>
        }
        from="from-pink-300"
        to="to-red-400"
        subtitle={
          <>
            Rapidly generate innovative ideas and high-quality&nbsp;content,
            streamlining the creative process, adapt&nbsp;content
            for&nbsp;international&nbsp;markets.
          </>
        }
      />

      <Grid>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-10 xl:col-start-2"
          )}
        >
          <div className="grid grid-cols-3 gap-4">
            <Block title="Faster content creation" color="pink">
              Accelerate your content generation across blogs, websites, and
              social media with Dust assistants. Your AI assistants seamlessly
              integrate with your brand's voice and past content, making
              creation quick and intuitive.
            </Block>
            {marketingSlides[0]}
            <Block title="More consistency" color="pink">
              Create assistants to help everyone maintain a unified brand voice
              and content consistency across all mediums and teams autonomously.
              Dust helps your marketing ensure your Product, Brand, Sales, and
              Success create consistent content whatever the touchpoint.
            </Block>
            {marketingSlides[1]}
            <Block title="Repurpose and repackage past content" color="pink">
              Maximize the value of your existing content. With Dust,
              effortlessly transform past materials into fresh content for your
              blogs, social media and product documentation, ensuring you make
              the most of your past investments and learnings.
            </Block>
            <Block title="Better competitive intelligence" color="sky">
              Gain an edge by creating competitive analysis assistants and
              improve your market intelligence velocity and impact. Dive deep
              into competitors' strategies, extract actionable insights based on
              defined frameworks, and generate automated reports to inform your
              strategy and decisions.
            </Block>
            {marketingSlides[3]}
            {marketingSlides[4]}
            <Block title="Faster on-boarding" color="emerald">
              Streamline the integration of new marketing team members with
              Dust. Create AI assistants to provide instant access to your
              marketing workflows, speeding up the learning curve and enhancing
              productivity.
            </Block>
            {marketingSlides[5]}
            <Block
              title="Better collaboration with Sales, Product and Support teams"
              color="amber"
            >
              Enhance cross-team collaboration effortlessly. Dust help you
              create AI assistants to bridge the gap between Marketing, Sales,
              Product, and Support, translating marketing decisions, objectives
              and strategies into the language of the recipient team.
            </Block>
          </div>
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

export const marketingSlides = [
  <DroidItem
    key="1"
    avatar={avatars[3]}
    name="@contentWriter"
    question="Create content based on examples of previous similar best-in-class content."
  />,
  <DroidItem
    key="2"
    avatar={avatars[6]}
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
    avatar={avatars[8]}
    name="@competitiveIntelligence"
    question="Synchronize your competitor websites, blogs, and job boards and get insights, ideas, and feedback to create and improve your market positioning. "
  />,
];
