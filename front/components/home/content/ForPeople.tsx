import React from "react";

import { avatars } from "@app/components/home/components/carousel";
import {
  Block,
  ContentAssistantBlock,
  DroidItem,
  HeaderContentBlock,
} from "@app/components/home/components/contentBlocks";
import { Grid, H3, P } from "@app/components/home/components/contentComponents";
import { classNames } from "@app/lib/utils";

const defaultFlexClasses = "flex flex-col gap-4";

export function ForPeople() {
  return (
    <>
      <HeaderContentBlock
        uptitle="Dust for Recruiting and People teams"
        title={
          <>
            Augment your workflows with AI&nbsp;assistance accross
            the&nbsp;board
          </>
        }
        from="from-amber-200"
        to="to-amber-400"
        subtitle={
          <>
            Onboarding&nbsp;better, Manage&nbsp;feedback, Support
            managers&nbsp;effectively, Scale performance analysis
            and&nbsp;Recruiting.
          </>
        }
      />
      <Grid>
        <div
          // ref={scrollRef1}
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-4"
          )}
        >
          <H3 className="text-white">
            Share knowledge better,
            <br />
            free time for you.
          </H3>
          <P size="md">
            Guide your team with a knowledge base and stop being a perpetual
            help desk. Focus on maintaining internal resources updated once and
            for all.
          </P>
        </div>
        <ContentAssistantBlock
          className="col-span-8"
          color="sky"
          content={
            <>
              <Block title="Onboard new people with accessible information at their pace">
                Transform your onboarding process using AI assistants design to
                guide knewcomers through your methodes, processes, people and
                culture.
              </Block>
              <Block title="Put your internal documentation to work">
                Create an assistant capable to answer any questions and point to
                the right internal ressources and spread your company culture
                and methods.
              </Block>
            </>
          }
          assistant=<>
            {peopleSlides[0]}
            {peopleSlides[1]}
          </>
        />
      </Grid>
      <Grid>
        <div
          // ref={scrollRef1}
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-4"
          )}
        >
          <H3 className="text-white">Help your people grow grow.</H3>
          <P size="md">Performance take less time and yield better results.</P>
        </div>
        <ContentAssistantBlock
          className="col-span-8"
          color="sky"
          content={
            <>
              <Block title="Better data">
                Good performance review is first good data. Collect informations
                from various channels to provide, get an holistic view of an
                employee's work, make more accurate evaluations.
              </Block>
              <Block title="Better Writing">
                Help your team write more thoughtfully. Challenges and enriches
                their writing with feedback on tone, refrences to the company’s
                operating principles, priorities and business objectives.
              </Block>
            </>
          }
          assistant=<></>
        />
        <ContentAssistantBlock
          className="col-span-12"
          color="sky"
          content={
            <>
              <Block title="Better analysis">
                AI augmented with company knowledge will help you go through the
                volume, summarize, read between the lines, compare effectively.
              </Block>
              <Block title="Better decisions">
                Screen for diversity and inclusion and reduce the bias in
                performance reviews by providing a more comprehensive and
                objective analysis of employee performances.
              </Block>
              <Block title="Better restitution">
                Write more personalized and reach feedback for your team,
                development plans and career pathing for employees, aligning
                with their strengths and improvement areas.
              </Block>
            </>
          }
          assistant=<></>
        />
      </Grid>

      {/* HIRING */}
      <Grid>
        <div
          // ref={scrollRef1}
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-4"
          )}
        >
          <H3 className="text-white">Boost your team hiring efforts.</H3>
          <P size="md">
            Reduce time to hire by providing fast guidance to hiring managers,
            assistance with writing job descriptions and communicate with
            candidates, analyse candidates answer better and faster.
          </P>
        </div>
        <ContentAssistantBlock
          className="col-span-8"
          color="sky"
          content={
            <>
              <Block title="Level your team up on hiring">
                Make your company hiring practices, guidelines and knowledge
                easy to find and leverage for everyone. Make your team better at
                writing exercises, questions, revieweing exercises response,
                read through candidates subtext. Score a candidate’s take-home
                answers with your rubric in mind.
              </Block>
              <Block title="Make AI work for you">
                Analyse candidate’s CV in a second Extract information from
                texts, normalise lists of emails and names, batch write content.
                Draft job description, social media posts, outbound emails,
                interview questions in minutes, with company tones and
                structure.
              </Block>
            </>
          }
          assistant=<>
            {peopleSlides[0]}
            {peopleSlides[1]}
            {peopleSlides[3]}
            {peopleSlides[4]}
          </>
        />
      </Grid>
    </>
  );
}

export const peopleSlides = [
  <DroidItem
    key="0"
    emoji="🧑‍🍼"
    avatarBackground="bg-sky-200"
    name="@onboardingBuddy"
    question="…"
  />,
  <DroidItem
    key="1"
    emoji="👋"
    avatarBackground="bg-sky-200"
    name="@people"
    question="Answer on slack all questions about processes, methodes, people and roles based on company documentation."
  />,
  <DroidItem
    key="2"
    avatar={avatars[3]}
    name="@hiringOps"
    question="Draft job descriptions, emails, social media coms based on company standards."
  />,
  <DroidItem
    key="3"
    avatar={avatars[5]}
    name="@interviewReading"
    question="Help read and analyse candidate expert according to company principles."
  />,
  <DroidItem
    key="4"
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
