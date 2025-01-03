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
        src="https://fast.wistia.net/embed/iframe/7ynip6mgfx?seo=true&videoFoam=true"
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
        <div className="flex flex-col items-center gap-16 md:flex-row md:gap-32">
          <div className="flex flex-col gap-8">
            <H1 className="text-red-400">
              Build custom AI&nbsp;assistants to speed up your work
            </H1>
            <div className="w-full md:hidden">
              <MainVisual />
            </div>
            <P size="lg" className="text-slate-50">
              Amplify your team's performance with personalized assistants
              connected to your proprietary knowledge and data.
            </P>
            <div>
              <Link href="/home/pricing" shallow={true}>
                <Button
                  variant="highlight"
                  size="md"
                  label="Get started"
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
            Connect <Strong>your team's data</Strong> and{" "}
            <Strong>break&nbsp;down knowledge silos</Strong> with
            context&#8209;aware&nbsp;assistants.
          </P>
          <P size="md" dotCSS="text-red-400" shape="rectangle">
            Empower your teams with&nbsp;
            <Strong>assistants tailored to&nbsp;their needs</Strong>{" "}
            on&nbsp;concrete use&nbsp;cases.
          </P>
          <P size="md" dotCSS="text-sky-400" shape="circle">
            Remain model agnostic: effortlessly{" "}
            <Strong>switch to the most advanced AI&nbsp;models</Strong> without
            touching your&nbsp;workflows.
          </P>
          <P size="md" dotCSS="text-emerald-400" shape="hexagon">
            <Strong>Control data access granularly</Strong> with a{" "}
            <Strong>safe and privacy-obsessed</Strong> application.
          </P>
        </div>
      </div>
    </div>
  );
}
