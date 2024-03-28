import React from "react";

import SimpleSlider, {
  avatars,
  DroidItem,
} from "@app/components/home/carousel";
import { HeaderContentBlock } from "@app/components/home/contentBlocks";
import { Grid, H2, H4, P } from "@app/components/home/contentComponents";
import { classNames } from "@app/lib/utils";

const defaultFlexClasses = "flex flex-col gap-4";

export function ForPeople() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Recruiting and People teams"
        title={
          <>
            <span className="text-emerald-100">
              Augment your workflows with AI&nbsp;assistance{" "}
            </span>
            <span className="text-emerald-400">accross the&nbsp;board</span>
          </>
        }
        subtitle={
          <>
            Onboarding&nbsp;better, Manage&nbsp;feedback, Support
            managers&nbsp;effectively, Scale performance analysis
            and&nbsp;Recruiting.
          </>
        }
      />
      <SimpleSlider slides={peopleSlides} />
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

export const peopleSlides = [
  <DroidItem
    key="1"
    avatar={avatars[3]}
    name="@hiringOps"
    question="Draft job descriptions, emails, social media coms based on company standards."
  />,
  <DroidItem
    key="2"
    avatar={avatars[5]}
    name="@interviewReading"
    question="Help read and analyse candidate expert according to company principles."
  />,
  <DroidItem
    key="3"
    avatar={avatars[7]}
    name="@people"
    question="Answer on slack all questions about processes, methodes, people and roles based on company documentation."
  />,
  <DroidItem
    key="5"
    avatar={avatars[6]}
    name="@hiringQuestions"
    question="Draft questions depending on the role, type of interview and stage in the process."
  />,
  <DroidItem
    key="5"
    avatar={avatars[9]}
    name="@candidate"
    question="Summarize available information about a candidate based on Company DB."
  />,
];
