import { Button, Hover3D, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import React from "react";

import { H1, P } from "@app/components/home/ContentComponents";
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

export function ProductIntroSection() {
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
            <H1 className="text-red-400">The OS of your AI Enterprise</H1>
            <div className="w-full md:hidden">
              <MainVisual />
            </div>
            <P size="lg" className="text-slate-50">
              Craft AI assistants that are super great.
            </P>
            <div className="flex justify-center gap-4 sm:justify-start">
              <Link href="/home/pricing" shallow={true}>
                <Button
                  variant="highlight"
                  size="md"
                  label="Try Dust Now"
                  icon={RocketIcon}
                />
              </Link>
              <Link href="/home/contact" shallow={true}>
                <Button variant="outline" size="md" label="Contact Sales" />
              </Link>
            </div>
          </div>
          <div className="hidden w-full max-w-2xl md:block">
            <MainVisual />
          </div>
        </div>
        <TrustedBy />
      </div>
    </div>
  );
}
