import { Button, Div3D, Hover3D, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import React from "react";

import {
  Grid,
  H1,
  H4,
  P,
  Strong,
} from "@app/components/home/new/ContentComponents";
import { classNames } from "@app/lib/utils";

export function IntroSection() {
  const MainVisualImage = () => (
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
      <Div3D depth={120} className="absolute top-0">
        <img
          src="/static/landing/mainVisual/MainVisual5.png"
          alt="MainVisual5"
        />
      </Div3D>
    </Hover3D>
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
            Cracking team productivity with&nbsp;AI
          </H1>
          {<div className="w-full md:hidden">{MainVisualImage()}</div>}
          <P size="lg" className="text-slate-50">
            The way we&nbsp;work is&nbsp;changing.
            <br />
            Break down knowledge silos and&nbsp;amplify team performance
            with&nbsp;data-augmented, customizable and&nbsp;secure
            AI&nbsp;assistants.
          </P>
          <div>
            <Link href="/pricing" shallow={true}>
              <Button
                variant="primary"
                size="md"
                label="Start now, check our pricing"
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
            Trusted by 100+ organizations, including:
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
            Connect <Strong>your team’s data</Strong> and{" "}
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
