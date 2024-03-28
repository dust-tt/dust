import {
  AnthropicWhiteLogo,
  Button,
  Div3D,
  DriveLogo,
  GithubWhiteLogo,
  GoogleLogo,
  Hover3D,
  MicrosoftLogo,
  MistralLogo,
  MoreIcon,
  NotionLogo,
  OpenaiWhiteLogo,
  RocketIcon,
  SalesforceLogo,
  SlackLogo,
} from "@dust-tt/sparkle";
import React from "react";

import {
  Grid,
  H1,
  H2,
  H3,
  P,
  ReactiveIcon,
  Strong,
} from "@app/components/home/contentComponents";

const defaultFlexClasses = "flex flex-col gap-4";

import SimpleSlider, { productSlides } from "@app/components/home/carousel";
import { classNames } from "@app/lib/utils";

export function ProductPage() {
  return (
    <>
      <Grid>
        <div
          className={classNames(
            "flex min-h-[60vh] flex-col justify-end gap-16 sm:gap-24",
            "col-span-12",
            "xl:col-span-10 xl:col-start-2",
            "2xl:col-span-8 2xl:col-start-3"
          )}
        >
          <div className="flex flex-col gap-12">
            <H1 className="text-slate-100">
              <span className="text-red-400">
                Amplify your team's potential
              </span>{" "}
              <br />
              with customizable and secure AI&nbsp;assistants.
            </H1>
            <H3 className="text-slate-100">
              AI is changing the way we work.
              <br />
              Effectively channeling its potential{" "}
              {/* <br className="lg:hidden" /> */}
              is a&nbsp;competitive&nbsp;edge.
            </H3>
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
      </Grid>
      <Grid className="items-center">
        <Hover3D
          className={classNames(
            "relative m-2 rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/70 to-gray-900/80 p-3 shadow-xl",
            "col-span-12",
            "sm:col-span-10 sm:col-start-2",
            "lg:col-span-7 lg:col-start-auto lg:row-span-4",
            "xl:col-span-6 xl:col-start-2",
            "2xl:col-span-5 2xl:col-start-3"
          )}
          depth={-20}
          perspective={1000}
        >
          <Div3D depth={10}>
            <img src="/static/landing/conversation_0.png" />
          </Div3D>
          <Div3D depth={30} className="absolute top-2">
            <img src="/static/landing/conversation_1.png" />
          </Div3D>
          <Div3D depth={70} className="absolute top-2">
            <img src="/static/landing/conversation_2.png" />
          </Div3D>
        </Hover3D>
        <div
          // ref={scrollRef0}
          className={classNames(
            "col-span-9",
            "sm:col-span-6",
            "lg:col-span-5",
            "xl:col-span-4",
            "2xl:col-span-3"
          )}
        >
          <P dotCSS="text-sky-400" shape="circle">
            Deploy <Strong>the best Large Language Models</Strong> to&nbsp;
            <Strong>all&nbsp;your&nbsp;company</Strong>,
            <br className="hidden sm:block" />
            today.
          </P>
        </div>
        <P
          dotCSS="text-amber-300"
          shape="triangle"
          className={classNames(
            "col-span-10 col-start-3",
            "sm:col-span-6 sm:col-start-auto",
            "lg:col-span-5",
            "xl:col-span-4",
            "2xl:col-span-3"
          )}
        >
          Connect Dust to <Strong>your team’s data</Strong> and{" "}
          <Strong>break down knowledge silos</Strong>{" "}
          with&nbsp;context&#8209;aware assistants.
        </P>
        <P
          dotCSS="text-red-400"
          shape="rectangle"
          className={classNames(
            "col-span-9",
            "sm:col-span-6",
            "lg:col-span-5",
            "xl:col-span-4",
            "2xl:col-span-3"
          )}
        >
          Empower your teams with{" "}
          <Strong>assistants tailored to&nbsp;their needs</Strong> on concrete
          use&nbsp;cases.
        </P>
        <P
          dotCSS="text-emerald-400"
          shape="hexagon"
          className={classNames(
            "col-span-10 col-start-3",
            "sm:col-span-6 sm:col-start-auto",
            "lg:col-span-5",
            "xl:col-span-4",
            "2xl:col-span-3"
          )}
        >
          <Strong>Control data access granularly</Strong> with a{" "}
          <Strong>safe and privacy-obsessed</Strong> application.
        </P>
      </Grid>

      <SimpleSlider slides={productSlides} />
      {/* Get state of the art*/}
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
            Get the state of the&nbsp;art,
            <br />
            <span className="text-sky-200">today and&nbsp;tomorrow.</span>
          </H2>
          <P size="lg">
            Dust gives you&nbsp;access to the&nbsp; leading models, <br />
            <Strong>
              augmented with&nbsp; your&nbsp;company’s internal&nbsp;information
            </Strong>
            .
          </P>
        </div>
      </Grid>

      {/* Get state of the art: Content*/}
      <Grid>
        <P
          dotCSS="text-sky-400"
          shape="square"
          className={classNames(
            "order-2 col-span-12",
            "sm:col-span-6 sm:self-center",
            "lg:order-1 lg:col-span-5 lg:col-start-2",
            "xl:col-span-4 xl:col-start-3",
            "2xl:col-span-3 2xl:col-start-4"
          )}
        >
          Your own knowledge base continuously in&nbsp;sync: <br />
          <Strong>
            Notion, Slack, GitHub, Google&nbsp;Drive, and&nbsp;more
          </Strong>
          .
        </P>
        <div
          className={classNames(
            "order-1 col-span-12 px-4",
            "sm:col-span-6 sm:p-0 ",
            "lg:order-2 lg:col-span-5",
            "xl:col-span-4 ",
            "2xl:col-span-3"
          )}
        >
          <Hover3D
            depth={-20}
            perspective={1000}
            className="relative rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/70 to-gray-900/80 shadow-xl"
          >
            <Div3D depth={30}>
              <img src="/static/landing/connect_0.png" />
            </Div3D>
            <Div3D depth={60} className="absolute top-0">
              <img src="/static/landing/connect_1.png" />
            </Div3D>
          </Hover3D>
        </div>

        <div
          className={classNames(
            "flex w-full flex-wrap justify-center gap-4",
            "order-3 col-span-12",
            "sm:col-span-5 sm:justify-end",
            "lg:col-span-4 lg:col-start-1",
            "xl:col-span-3 xl:col-start-2 xl:pl-0",
            "2xl:col-start-3 2xl:pl-6"
          )}
        >
          <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Google Workspace">
            <GoogleLogo />
          </ReactiveIcon>
          <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Google Drive">
            <DriveLogo />
          </ReactiveIcon>
          <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Notion">
            <NotionLogo />
          </ReactiveIcon>
          <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Salesforce">
            <SalesforceLogo />
          </ReactiveIcon>
          <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Slack">
            <SlackLogo />
          </ReactiveIcon>
          {/* <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Intercom">
    <IntercomLogo />
  </ReactiveIcon> */}
          <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Github">
            <GithubWhiteLogo />
          </ReactiveIcon>
          {/* <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="More coming…">
    <MoreIcon className="text-slate-50" />
  </ReactiveIcon> */}
        </div>
        <P
          dotCSS="text-sky-400"
          shape="circle"
          className={classNames(
            "order-4 col-span-12",
            "sm:col-span-7 sm:self-center",
            "lg:col-span-7",
            "xl:col-span-6",
            "2xl:col-span-4"
          )}
        >
          With the support of&nbsp;multiple sources of&nbsp;data
          and&nbsp;models,{" "}
          <Strong>
            Dust is&nbsp; exceptionally modular and&nbsp;adaptable
          </Strong>
          , tailoring to&nbsp;your unique requirements,
          continuously&nbsp;evolving to&nbsp;meet your&nbsp;changing&nbsp;needs
          .
        </P>
        <div
          className={classNames(
            "flex w-full flex-wrap justify-center gap-4",
            "order-5 col-span-12",
            "sm:col-span-5 sm:col-start-2 sm:justify-end",
            "lg:col-span-4 lg:col-start-4",
            "xl:col-span-3 xl:col-start-4 xl:pl-0",
            "2xl:col-start-5 2xl:pl-6"
          )}
        >
          <ReactiveIcon
            colorHEX="#A26BF7"
            tooltipLabel="OpenAI, GPT3.5 and GPT4"
          >
            <OpenaiWhiteLogo />
          </ReactiveIcon>
          <ReactiveIcon colorHEX="#D4A480" tooltipLabel="Anthropic Claude">
            <AnthropicWhiteLogo />
          </ReactiveIcon>
          <ReactiveIcon colorHEX="#1A1C20" tooltipLabel="Mistral">
            <MistralLogo />
          </ReactiveIcon>
          <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Microsoft Azure">
            <MicrosoftLogo />
          </ReactiveIcon>
          <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="And more…">
            <MoreIcon className="text-slate-50" />
          </ReactiveIcon>
        </div>
        <P
          dotCSS="text-sky-400"
          shape="triangle"
          className={classNames(
            "order-6 col-span-12",
            "sm:order-5 sm:col-span-6 sm:self-center",
            "lg:col-span-3"
          )}
        >
          Proprietary and&nbsp;open-source models suited
          to&nbsp;your&nbsp;needs:{" "}
          <Strong>OpenAI,&nbsp;Anthropic,&nbsp;Mistral…</Strong>
        </P>
      </Grid>

      {/* Bring your team*/}
      <Grid>
        <div
          // ref={scrollRef2}
          className={classNames(
            defaultFlexClasses,
            "col-span-12",
            "lg:col-span-10 lg:col-start-2",
            "xl:col-span-9 xl:col-start-2",
            "2xl:col-start-3"
          )}
        >
          <H2 className="text-amber-400">
            Bring your&nbsp;team
            <br />
            <span className="text-amber-100">up&nbsp;to&nbsp;speed.</span>
          </H2>
          <P size="lg">
            Adopting AI is a&nbsp;fundamental shift for&nbsp;your
            team’s&nbsp;workflows.
          </P>
          <P size="lg">
            <Strong>
              Dust helps identify your most creative and driven
              team&nbsp;members, develop and&nbsp;share their&nbsp;experience
              with&nbsp;AI throughout your&nbsp;company.
            </Strong>
          </P>
        </div>
      </Grid>

      {/* Bring your team: Content*/}
      <Grid verticalAlign="center">
        <Hover3D
          depth={-20}
          perspective={1000}
          className={classNames(
            "relative rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/70 to-gray-900/80 shadow-xl",
            "order-1",
            "col-span-12",
            "sm:col-span-10 sm:col-start-2",
            "md:col-span-8 md:col-start-auto",
            "lg:order-1 lg:col-span-7 lg:row-span-3 lg:self-end",
            "xl:col-span-6 xl:col-start-2",
            "2xl:order-1 2xl:col-span-5 2xl:col-start-3 2xl:row-span-2 2xl:self-start"
          )}
        >
          <Div3D depth={30}>
            <img src="/static/landing/builder_0.png" />
          </Div3D>
          <Div3D depth={70} className="absolute top-0">
            <img src="/static/landing/builder_1.png" />
          </Div3D>
        </Hover3D>

        <Hover3D
          depth={-20}
          perspective={1000}
          className={classNames(
            "relative rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/70 to-gray-900/80 shadow-xl",
            "order-2",
            "col-span-6 row-span-3 hidden sm:block",
            "md:col-span-6",
            "lg:row-span-auto lg:order-5 lg:col-span-4 lg:col-start-auto lg:self-start",
            "xl:col-start-2",
            "2xl:order-3 2xl:col-span-3 2xl:col-start-auto"
          )}
        >
          <Div3D depth={30}>
            <img
              src="/static/landing/assistants_0.png"
              className="absolute top-0"
            />
          </Div3D>
          <Div3D depth={70}>
            <img src="/static/landing/assistants_1.png" />
          </Div3D>
        </Hover3D>

        <P
          dotCSS="text-amber-300"
          shape="triangle"
          className={classNames(
            "order-3",
            "col-span-12",
            "sm:col-span-6",
            "md:order-1 md:col-span-4",
            "lg:order-2 lg:col-span-5",
            "xl:col-span-4",
            "2xl:order-2 2xl:col-span-4 2xl:mt-8"
          )}
        >
          Team members <Strong>imagine new workflows</Strong> and&nbsp;
          <Strong>package them</Strong> with assistants that&nbsp;others
          can&nbsp;effortlessly&nbsp;use.
        </P>

        <P
          dotCSS="text-amber-300"
          shape="rectangle"
          className={classNames(
            "order-4",
            "col-span-12",
            "sm:col-span-6",
            "md:order-3",
            "lg:order-3 lg:col-span-5",
            "xl:col-span-4",
            "2xl:order-5 2xl:col-span-4 2xl:self-start"
          )}
        >
          <Strong>Spread good practices</Strong> &&nbsp;foster collaboration
          with shared conversations, @mentions in&nbsp;discussions and{" "}
          our&nbsp;Slackbot&nbsp;integration.
        </P>
        <P
          dotCSS="text-amber-300"
          shape="hexagon"
          className={classNames(
            "order-5",
            "col-span-12",
            "sm:col-span-6",
            "md:order-4",
            "lg-order-4 lg:col-span-4",
            "2xl:order-6 2xl:col-span-3 2xl:self-start"
          )}
        >
          <Strong>Manage workspace invitations seamlessly</Strong>&nbsp;with{" "}
          single sign&#8209;on&nbsp;(SSO).
        </P>
        <Hover3D
          depth={-20}
          perspective={1000}
          className={classNames(
            "relative rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/70 to-gray-900/80 shadow-xl",
            "order-6",
            "col-span-12 sm:hidden",
            "md:col-span-10 md:col-start-2 lg:block",
            "md:order-5",
            "lg:order-6 lg:col-span-8 lg:col-start-auto",
            "xl:col-span-7",
            "2xl:order-4 2xl:col-span-5 2xl:col-start-2 2xl:row-span-4"
          )}
        >
          <Div3D depth={30} className="overflow-hidden rounded-2xl">
            <img src="/static/landing/slack_0.png" />
          </Div3D>
          <Div3D depth={50} className="absolute top-0">
            <img src="/static/landing/slack_1.png" />
          </Div3D>
          <Div3D depth={90} className="absolute top-0">
            <img src="/static/landing/slack_2.png" />
          </Div3D>
        </Hover3D>
        {/* <ReactiveImg
  className={classNames(
    "order-6",
    "col-span-12 sm:hidden",
    "md:col-span-10 md:col-start-2 lg:block",
    "md:order-5",
    "lg:order-6 lg:col-span-8 lg:col-start-auto",
    "xl:col-span-7",
    "2xl:order-4 2xl:col-span-5 2xl:col-start-2 2xl:row-span-4"
  )}
>
  <div className="rounded-xl">
    <img src="/static/landing/slack.png" />
  </div>
</ReactiveImg> */}
      </Grid>

      {/* Design for security */}
      <Grid>
        <div
          // ref={scrollRef3}
          className="col-span-12 md:col-span-6 md:row-span-2 xl:col-span-5 xl:col-start-2"
        >
          <H2 className="text-red-400">
            Designed for security
            <br />
            <span className="text-red-200">and data privacy.</span>
          </H2>
        </div>
        <P size="lg" className="col-span-6 xl:col-span-5 2xl:col-span-4">
          <Strong>Your data is private</Strong>, No re-training of&nbsp;models
          on your internal knowledge.
        </P>
        <P size="lg" className="col-span-6 xl:col-span-5 2xl:col-span-4">
          <Strong>Enterprise-grade security</Strong> to manage your&nbsp;data
          access policies with control and&nbsp;confidence.
        </P>
      </Grid>

      {/* Need more? */}
      <Grid>
        <H2 className="order-1 col-span-12 text-emerald-500 md:col-span-6 xl:col-span-5  xl:col-start-2">
          Need more?
          <br />
          <span className="text-emerald-200">Dust do it!</span>
        </H2>

        <Hover3D
          depth={-20}
          perspective={1000}
          className={classNames(
            "relative rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/70 to-gray-900/80 shadow-xl",
            "order-2",
            "col-span-10 col-start-2",
            "sm:col-span-8 sm:col-start-3",
            "md:col-span-6 md:col-start-auto md:row-span-3 md:self-center",
            "xl:col-span-5",
            "2xl:col-span-4"
          )}
        >
          <Div3D depth={30}>
            <img src="/static/landing/apps_0.png" />
          </Div3D>
          <Div3D depth={70} className="absolute top-0">
            <img src="/static/landing/apps_1.png" />
          </Div3D>
        </Hover3D>
        <P
          size="lg"
          className="order-3 col-span-6 lg:col-span-5 xl:col-start-2"
        >
          Provide <Strong>developers and tinkerers with a&nbsp;platform</Strong>{" "}
          to&nbsp;build custom actions and&nbsp;application orchestration
          to&nbsp;fit your team’s&nbsp;exact&nbsp;needs.
        </P>
        <P
          size="lg"
          className="order-4 col-span-6 lg:col-span-5 xl:col-start-2"
        >
          Support <Strong>custom plugins</Strong> for assistants to interact
          with your <Strong>own databases on advanced use cases</Strong>.
        </P>
      </Grid>
    </>
  );
}
