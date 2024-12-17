import {
  Button,
  Div3D,
  Hover3D,
  PlayIcon,
  RocketIcon,
  Spinner,
} from "@dust-tt/sparkle";
import Link from "next/link";
import React, { useEffect, useState } from "react";

import { H1, P } from "@app/components/home/ContentComponents";

const ResponsiveIframe = () => {
  return (
    <div className="relative h-[70vh] w-[70vw]">
      <iframe
        src="https://fast.wistia.net/embed/iframe/v90n8beuh9?seo=true&videoFoam=false"
        title="Dust product tour"
        allow="autoplay; fullscreen"
        frameBorder="0"
        className="absolute left-0 top-0 h-full w-full rounded-lg"
      ></iframe>
    </div>
  );
};

export function IntroSection() {
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (isVideoOpen) {
      setShowSpinner(true);
      const timer = setTimeout(() => {
        setShowSpinner(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isVideoOpen]);

  const MainVisualImage = () => (
    <>
      {showSpinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-50 backdrop-blur-md"></div>
          <Spinner size="xl" />
        </div>
      )}
      {isVideoOpen && !showSpinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black opacity-50 backdrop-blur-md"
            onClick={() => setIsVideoOpen(false)}
          ></div>
          <div className="z-10 overflow-hidden rounded-lg">
            <ResponsiveIframe />
          </div>
        </div>
      )}

      <Hover3D depth={-40} perspective={1000} className="relative">
        <Div3D depth={-30}>
          <img
            src="/static/landing/mainVisual/MainVisual1.png"
            alt="MainVisual1"
          />
        </Div3D>
        <Div3D depth={-10} className="absolute top-0">
          <img
            src="/static/landing/mainVisual/MainVisual2.png"
            alt="MainVisual2"
          />
        </Div3D>
        <Div3D depth={40} className="absolute top-0">
          <img
            src="/static/landing/mainVisual/MainVisual3.png"
            alt="MainVisual3"
          />
        </Div3D>
        <Div3D depth={-5} className="absolute top-0">
          <img
            src="/static/landing/mainVisual/MainVisual4.png"
            alt="MainVisual4"
          />
        </Div3D>
        <Div3D depth={100} className="absolute top-0">
          <img
            src="/static/landing/mainVisual/MainVisual5.png"
            alt="MainVisual5"
          />
        </Div3D>
        <Div3D
          depth={150}
          className="absolute top-0 flex h-full w-full items-center justify-center"
        >
          <Button
            icon={PlayIcon}
            variant="highlight"
            size="md"
            label="Watch Product Tour"
            className="shadow-xl"
            onClick={() => setIsVideoOpen(true)}
          />
        </Div3D>
      </Hover3D>
    </>
  );

  return (
    <div className="w-full pt-[6vh] sm:pt-[8vh] xl:pt-[12vh] 2xl:pt-[18vh]">
      <div className="flex flex-col gap-16 md:flex-row md:gap-32">
        <div className="flex flex-col gap-8">
          <H1 from="from-red-200" to="to-red-400">
            Build custom AI&nbsp;assistants to speed up your work
          </H1>
          <div className="w-full md:hidden">{MainVisualImage()}</div>
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
        <div className="hidden md:block">{MainVisualImage()}</div>
      </div>
    </div>
  );
}
