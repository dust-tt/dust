import { Button, Div3D, Hover3D, RocketIcon } from "@dust-tt/sparkle";
import React from "react";

import {
  Grid,
  H1,
  H4,
  P,
  Strong,
} from "@app/components/home/new/ContentComponents";
import { classNames } from "@app/lib/utils";

interface IntroSectionProps {
  postLoginReturnToUrl: string;
}

export function IntroSection({ postLoginReturnToUrl }: IntroSectionProps) {
  const MainVisualImage = () => (
    <Hover3D depth={-20} perspective={1000} className="relative">
      <Div3D depth={-20}>
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
      <Div3D depth={20} className="absolute top-0">
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
      <Div3D depth={50} className="absolute top-0">
        <img
          src="/static/landing/mainVisual/MainVisual5.png"
          alt="MainVisual5"
        />
      </Div3D>
    </Hover3D>
  );

  return (
    <>
      <Grid className="min-h-[60vh]" gap="gap-y-8">
        <div
          className={classNames(
            "col-span-12",
            "flex flex-col gap-8",
            "md:col-span-6",
            "xl:col-span-5",
            "2xl:col-start-2"
          )}
        >
          <div className="flex flex-col gap-8 lg:gap-12">
            <H1 from="from-red-200" to="to-red-400">
              Cracking
              <br />
              team AI productivity
            </H1>
            {<div className="md:hidden">{MainVisualImage()}</div>}
            <P size="lg" className="text-slate-50">
              AI is changing the way we work.
              <br />
              Break down knowledge silos, augment your&nbsp;workflows with
              data-augmented, customizable and secure&nbsp;AI&nbsp;assistants.
            </P>
            <div>
              <Button
                variant="primary"
                size="md"
                label="Start with Dust Now"
                icon={RocketIcon}
                onClick={() =>
                  (window.location.href = `/api/auth/login?returnTo=${postLoginReturnToUrl}`)
                }
              />
            </div>
          </div>
        </div>
        <div
          className={classNames(
            "col-span-12 hidden",
            "md:col-span-6 md:block md:pt-8",
            "lg:p-0",
            "xl:col-span-7",
            "2xl:col-span-6"
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
            "grid grid-cols-1 gap-12",
            "md:grid-cols-2 md:gap-6",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-8 xl:col-start-3"
          )}
        >
          <P size="md" dotCSS="text-amber-300" shape="triangle">
            Connect <Strong>your team’s data</Strong> and{" "}
            <Strong>break&nbsp;down knowledge silos</Strong> with
            context&#8209;aware&nbsp;assistants.
          </P>
          <P size="md" dotCSS="text-red-400" shape="rectangle">
            Empower your teams with{" "}
            <Strong>assistants tailored to&nbsp;their needs</Strong> on concrete
            use&nbsp;cases.
          </P>
          <P size="md" dotCSS="text-sky-400" shape="circle">
            Effortlessly <Strong>switch to the most advanced AI models</Strong>{" "}
            without touching your workflows. Dust is model&nbsp;agnostic.
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
