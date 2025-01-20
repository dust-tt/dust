import { Button, Hover3D, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import React from "react";

import { H1, P, Strong } from "@app/components/home/ContentComponents";
import TrustedBy from "@app/components/home/TrustedBy";

const VideoPlayer = () => {
  return (
    <div className="relative w-full pt-[56.25%]">
      {" "}
      {/* 16:9 aspect ratio */}
      <iframe
        src="https://fast.wistia.net/embed/iframe/7ynip6mgfx?seo=true&videoFoam=true&autoPlay=true"
        title="Dust product tour"
        allow="autoplay; fullscreen"
        frameBorder="0"
        className="absolute inset-0 h-full w-full rounded-lg"
      ></iframe>
    </div>
  );
};

export function IntroSection() {
  const MainVisual = () => (
    <Hover3D depth={-40} perspective={1000} className="relative w-full">
      <VideoPlayer />
    </Hover3D>
  );

  return (
    <div className="w-full pt-[6vh] sm:pt-[8vh] xl:pt-[12vh] 2xl:pt-[18vh]">
      <div className="flex flex-col gap-16">
        <div className="flex flex-col items-center gap-16 md:flex-row">
          <div className="flex flex-col gap-8">
            <H1 className="text-red-400">
              Be superhuman at work with context-aware AI assistants
            </H1>
            <div className="w-full md:hidden">
              <MainVisual />
            </div>
            <P size="lg" className="text-slate-50">
              Craft AI assistants for your teams to automate tedious tasks,
              retrieve vital knowledge, and help you create —right where you
              work, no coding required.
            </P>
            <div>
              <Link href="/home/pricing" shallow={true}>
                <Button
                  variant="highlight"
                  size="md"
                  label="Try Dust Now"
                  icon={RocketIcon}
                />
              </Link>
            </div>
          </div>
          <div className="hidden w-full max-w-2xl md:block">
            <MainVisual />
          </div>
        </div>
        <TrustedBy />
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <P size="md" dotCSS="text-amber-300" shape="triangle">
            <Strong className="s-text-2xl">Automate Knowledge Work</Strong>
            <br></br>
            <br></br>
            Stop wasting time on data entry, CRM updates, or filling out
            questionnaires. Teach Dust your workflow—and watch it handle
            repetitive tasks for you.
          </P>
          <P size="md" dotCSS="text-red-400" shape="rectangle">
            <Strong className="s-text-2xl">Surface Critical Information</Strong>
            <br></br>
            <br></br>
            Dust reads faster than you. Enjoy effortless summarization, targeted
            extractions, and crisp insights from docs, tickets, chat
            logs—whatever is relevant.
          </P>
          <P size="md" dotCSS="text-sky-400" shape="circle">
            <Strong className="s-text-2xl">Analyze & Visualize Anything</Strong>
            <br></br>
            <br></br>
            From spreadsheets to data warehouses. Your questions are turned into
            SQL queries, charts, pivots, or deep dives, in seconds.
          </P>
          <P size="md" dotCSS="text-emerald-400" shape="hexagon">
            <Strong className="s-text-2xl">Create with Confidence</Strong>
            <br></br>
            <br></br>
            Co-edit with AI that has full context of your internal knowledge
            base, so you never waste time hunting for data or rewriting outdated
            content.
          </P>
        </div>
      </div>
    </div>
  );
}
