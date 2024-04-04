import React from "react";

import { avatars, DroidItem } from "@app/components/home/components/carousel";
import {
  Block,
  HeaderContentBlock,
} from "@app/components/home/components/contentBlocks";
import {
  Grid,
  H1,
  H2,
  P,
} from "@app/components/home/components/contentComponents";
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
      {/* <SimpleSlider slides={peopleSlides} /> */}
      {/* SHARE KNOWLEDGE */}
      <Grid>
        <div
          // ref={scrollRef1}
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-8 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H2 className="text-pink-500">
            Share knowledge better,
            <br />
            <span className="text-pink-200">free time for you.</span>
          </H2>
          <P size="lg">
            Guide your team with a knowledge base and stop being a perpetual
            help desk. Focus on maintaining internal resources updated once and
            for all.
          </P>
        </div>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-9 xl:col-start-2"
          )}
        >
          <div className="grid grid-cols-3 gap-4">
            <Block
              title="Onboard new people with accessible information at their pace"
              color="pink"
            >
              Transform your onboarding process using AI assistants design to
              guide knewcomers through your methodes, processes, people and
              culture.
            </Block>
            <Block title="Put your internal documentation to work" color="pink">
              Create an assistant capable to answer any questions and point to
              the right internal ressources and spread your company culture and
              methods.
            </Block>
            {peopleSlides[2]}
          </div>
        </div>
      </Grid>

      {/* PEOPLE GROW */}
      <Grid>
        <div
          // ref={scrollRef1}
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-8 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H2 className="text-amber-500">
            Help your people grow <span className="text-amber-200">grow.</span>
          </H2>
          <P size="lg">Performance take less time and yield better results.</P>
        </div>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-9 xl:col-start-2"
          )}
        >
          <div className="grid grid-cols-3 gap-4">
            <Block title="Better data" color="amber">
              Good performance review is first good data. Collect informations
              from various channels to provide, get an holistic view of an
              employee's work, make more accurate evaluations.
            </Block>
            <Block title="Better Writing" color="amber">
              Help your team write more thoughtfully. Challenges and enriches
              their writing with feedback on tone, refrences to the company’s
              operating principles, priorities and business objectives.
            </Block>
            <Block title="Better analysis" color="amber">
              AI augmented with company knowledge will help you go through the
              volume, summarize, read between the lines, compare effectively.
            </Block>
            <Block title="Better decisions" color="amber">
              Screen for diversity and inclusion and reduce the bias in
              performance reviews by providing a more comprehensive and
              objective analysis of employee performances.
            </Block>
            <Block title="Better restitution" color="amber">
              Write more personalized and reach feedback for your team,
              development plans and career pathing for employees, aligning with
              their strengths and improvement areas.
            </Block>
          </div>
        </div>
      </Grid>

      {/* HIRING */}
      <Grid>
        <div
          // ref={scrollRef1}
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-8 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H2 className="text-sky-500">
            Boost your team{" "}
            <span className="text-sky-200">hiring efforts.</span>
          </H2>
          <P size="lg">
            Reduce time to hire by providing fast guidance to hiring managers,
            assistance with writing job descriptions and communicate with
            candidates, analyse candidates answer better and faster.
          </P>
        </div>
        <div
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-9 xl:col-start-2"
          )}
        >
          <div className="grid grid-cols-3 gap-4">
            <Block title="Level your team up on hiring" color="sky">
              Make your company hiring practices, guidelines and knowledge easy
              to find and leverage for everyone. Make your team better at
              writing exercises, questions, revieweing exercises response, read
              through candidates subtext. Score a candidate’s take-home answers
              with your rubric in mind.
            </Block>
            <Block title="Make AI work for you" color="sky">
              Analyse candidate’s CV in a second Extract information from texts,
              normalise lists of emails and names, batch write content. Draft
              job description, social media posts, outbound emails, interview
              questions in minutes, with company tones and structure.
            </Block>
            {peopleSlides[0]}
            {peopleSlides[1]}
            {peopleSlides[3]}
            {peopleSlides[4]}
          </div>
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
