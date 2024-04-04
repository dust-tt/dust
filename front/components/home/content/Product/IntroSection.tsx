import { Button, Div3D, Hover3D, RocketIcon } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ParsedUrlQuery } from "querystring";
import React from "react";

import {
  Grid,
  H1,
  H4,
  P,
  Strong,
} from "@app/components/home/components/contentComponents";
import { classNames } from "@app/lib/utils";

interface IntroSectionProps {
  getReturnToUrl: (routerQuery: ParsedUrlQuery) => string;
}

export function IntroSection({ getReturnToUrl }: IntroSectionProps) {
  const router = useRouter();
  return (
    <>
      <Grid className="min-h-[60vh]" verticalAlign="center">
        <div
          className={classNames(
            "flex flex-col justify-end justify-center gap-16 sm:gap-24",
            "col-span-12",
            "xl:col-span-5",
            "2xl:col-start-2"
          )}
        >
          <div className="flex flex-col gap-12">
            <H1 className="text-red-300">
              Cracking
              <br />
              <span className="text-red-400">team AI productivity</span>
            </H1>
            <H4 className="text-slate-50">
              AI is changing the way we work.
              <br />
              Break down knowledge silos, augment your workflows with
              data&nbsp;augmented, customizable and
              secure&nbsp;AI&nbsp;assistants.
            </H4>
            <div className="sm: flex w-full flex-wrap gap-4 sm:justify-start sm:gap-4 md:gap-6">
              <Button
                variant="primary"
                size="md"
                label="Start with Dust Now"
                icon={RocketIcon}
                onClick={() =>
                  (window.location.href = `/api/auth/login?returnTo=${getReturnToUrl(
                    router.query
                  )}`)
                }
              />
            </div>
          </div>
        </div>
        <div
          className={classNames(
            "pt-16",
            "col-span-12",
            "xl:col-span-7",
            "2xl:col-span-6"
          )}
        >
          <Hover3D depth={-20} perspective={1000} className="relative">
            <Div3D depth={-20}>
              <img src="/static/landing/mainVisual/MainVisual1.png" />
            </Div3D>
            <Div3D depth={-10} className="absolute top-0">
              <img src="/static/landing/mainVisual/MainVisual2.png" />
            </Div3D>
            <Div3D depth={20} className="absolute top-0">
              <img src="/static/landing/mainVisual/MainVisual3.png" />
            </Div3D>
            <Div3D depth={-5} className="absolute top-0">
              <img src="/static/landing/mainVisual/MainVisual4.png" />
            </Div3D>
            <Div3D depth={50} className="absolute top-0">
              <img src="/static/landing/mainVisual/MainVisual5.png" />
            </Div3D>
          </Hover3D>
        </div>
        <div className="col-span-12 grid grid grid-cols-4 gap-12">
          <img src="/static/landing/logos/alan.png" />
          <img src="/static/landing/logos/qonto.png" />
          <img src="/static/landing/logos/pennylane.png" />
          <img src="/static/landing/logos/payfit.png" />
        </div>
        <div className="col-span-8 col-start-3 grid grid grid-cols-2 gap-12">
          <P dotCSS="text-amber-300" shape="triangle">
            Connect <Strong>your team’s data</Strong> and{" "}
            <Strong>break down knowledge silos</Strong>{" "}
            with&nbsp;context&#8209;aware assistants.
          </P>
          <P dotCSS="text-red-400" shape="rectangle">
            Empower your teams with{" "}
            <Strong>assistants tailored to&nbsp;their needs</Strong> on concrete
            use&nbsp;cases.
          </P>
          <P dotCSS="text-sky-400" shape="circle">
            Effortlessly <Strong>switch to the most advanced AI models</Strong>{" "}
            without touching your workflows. Dust is model&nbsp;agnostic.
          </P>
          <P dotCSS="text-emerald-400" shape="hexagon">
            <Strong>Control data access granularly</Strong> with a{" "}
            <Strong>safe and privacy-obsessed</Strong> application.
          </P>
        </div>
      </Grid>
    </>
  );
}
