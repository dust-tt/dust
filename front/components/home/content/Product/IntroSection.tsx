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

import {
  Grid,
  H1,
  H4,
  P,
  Strong,
} from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

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
            variant="primary"
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
    <>
      <Grid
        className="pt-[6vh] sm:pt-[8vh] xl:pt-[12vh] 2xl:pt-[18vh]"
        verticalAlign="center"
      >
        <div
          className={classNames(
            "col-span-12",
            "flex flex-col gap-8",
            "md:col-span-6",
            "2xl:col-span-5 2xl:col-start-2"
          )}
        >
          <H1 from="from-red-200" to="to-red-400">
            Build custom AI&nbsp;assistants to speed up your work
          </H1>
          {<div className="w-full md:hidden">{MainVisualImage()}</div>}
          <P size="lg" className="text-slate-50">
            Amplify your team's performance with personalized assistants
            connected to your proprietary knowledge and data.
          </P>
          <div>
            <Link href="/home/pricing" shallow={true}>
              <Button
                variant="primary"
                size="md"
                label="Get started"
                icon={RocketIcon}
              />
            </Link>
          </div>
        </div>
        <div
          className={classNames(
            "col-span-12 hidden",
            "md:col-span-6 md:block",
            "2xl:col-span-5 2xl:col-start-8"
          )}
        >
          {MainVisualImage()}
        </div>
        <div
          className={classNames(
            "col-span-12 flex flex-col items-center py-8",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-8 xl:col-start-3"
          )}
        >
          <H4 className="w-full text-center text-white">
            Trusted by 500+ organizations, including:
          </H4>
          <div
            className={classNames(
              "max-w-[400px] sm:w-full sm:max-w-none",
              "grid grid-cols-2 gap-x-2",
              "md:grid-cols-4 md:gap-x-12"
            )}
          >
            <img src="/static/landing/logos/alan.png" />
            <img src="/static/landing/logos/qonto.png" />
            <img src="/static/landing/logos/pennylane.png" />
            <img src="/static/landing/logos/payfit.png" />
          </div>
        </div>
        <div
          className={classNames(
            "col-span-12",
            "grid grid-cols-1 gap-12 px-6",
            "sm:grid-cols-2 sm:gap-6 sm:pr-0",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-12 xl:grid-cols-4"
          )}
        >
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
      </Grid>
    </>
  );
}
