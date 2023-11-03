import {
  AnthropicLogo,
  Button,
  DriveLogo,
  GithubWhiteLogo,
  GoogleLogo,
  Logo,
  LogoHorizontalWhiteLogo,
  MicrosoftLogo,
  MistralLogo,
  MoreIcon,
  NotionLogo,
  OpenaiLogo,
  SlackLogo,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Script from "next/script";
import { signIn } from "next-auth/react";
import { ParsedUrlQuery } from "querystring";
import React, { useEffect, useRef, useState } from "react";

import {
  A,
  Grid,
  H1,
  H2,
  H3,
  P,
  ReactiveIcon,
  ReactiveImg,
  Strong,
} from "@app/components/home/contentComponents";

const defaultFlexClasses = "flex flex-col gap-4";

import {
  SignInDropDownButton,
  SignUpDropDownButton,
} from "@app/components/Button";
import Particles from "@app/components/home/particles";
import ScrollingHeader from "@app/components/home/scrollingHeader";
import { PricePlans } from "@app/components/PlansTables";
import { getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  if (user && user.workspaces.length > 0) {
    let url = `/w/${user.workspaces[0].sId}`;

    if (context.query.wId) {
      url = `/api/login?wId=${context.query.wId}`;
    }
    if (context.query.inviteToken) {
      url = `/api/login?inviteToken=${context.query.inviteToken}`;
    }

    return {
      redirect: {
        destination: url,
        permanent: false,
      },
    };
  }

  return {
    props: { gaTrackingId: GA_TRACKING_ID },
  };
};

export default function Home({
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [logoY, setLogoY] = useState<number>(0);
  const logoRef = useRef<HTMLDivElement | null>(null);

  const scrollRef0 = useRef<HTMLDivElement | null>(null);
  const scrollRef1 = useRef<HTMLDivElement | null>(null);
  const scrollRef2 = useRef<HTMLDivElement | null>(null);
  const scrollRef3 = useRef<HTMLDivElement | null>(null);
  const scrollRef4 = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logoRef.current) {
      const logoPosition = logoRef.current.offsetTop;
      setLogoY(logoPosition);
    }
  }, []);

  function getCallbackUrl(routerQuery: ParsedUrlQuery): string {
    let callbackUrl = "/api/login";
    if (routerQuery.wId) {
      callbackUrl += `?wId=${routerQuery.wId}`;
    } else if (routerQuery.inviteToken) {
      callbackUrl += `?inviteToken=${routerQuery.inviteToken}`;
    }
    return callbackUrl;
  }

  return (
    <>
      <Header />
      <ScrollingHeader showItemY={logoY}>
        <div className="flex h-full w-full items-center gap-10 px-4">
          <Logo className="logo invisibleFirst hidden h-[24px] w-[96px] opacity-0 transition-all duration-500 ease-out md:block" />
          <div className="invisibleFirst hidden flex-row justify-start gap-6 opacity-0 transition-all duration-500 ease-out lg:flex">
            <P size="xs">
              <A variant="tertiary" href="#sectionProduct">
                The product
              </A>
            </P>
            <P size="xs">
              <A variant="tertiary" href="#sectionPricing">
                Price plans
              </A>
            </P>
            {/* <P size="xs">
              <A variant="tertiary" href="#section3">
                Testimonials
              </A>
            </P> */}
          </div>
          <div className="flex-grow" />
          <Button.List>
            <SignUpDropDownButton
              buttonClassname="invisibleFirst hidden opacity-0 transition-all duration-500 ease-out lg:flex"
              onClickGoogle={() =>
                signIn("google", {
                  callbackUrl: getCallbackUrl(router.query),
                })
              }
            />
            <SignInDropDownButton
              shouldDisplayGithub={
                !(router.query.signIn && router.query.signIn !== "github")
              }
              onClickGithub={() => {
                void signIn("github", {
                  callbackUrl: getCallbackUrl(router.query),
                });
              }}
              onClickGoogle={() =>
                signIn("google", {
                  callbackUrl: getCallbackUrl(router.query),
                })
              }
            />
          </Button.List>
        </div>
      </ScrollingHeader>

      {/* Keeping the background dark */}
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-900" />
      {/* Particle system */}
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-40 overflow-hidden transition duration-[1000ms]">
        <Particles
          scrollRef0={scrollRef0}
          scrollRef1={scrollRef1}
          scrollRef2={scrollRef2}
          scrollRef3={scrollRef3}
          scrollRef4={scrollRef4}
        />
      </div>

      <main className="z-10 flex flex-col items-center">
        <div
          className={classNames(
            "container flex flex-col",
            "gap-16 py-24",
            "md:gap-28 md:py-36",
            "xl:gap-36",
            "2xl:gap-48"
          )}
        >
          <Grid>
            <div
              className={classNames(
                "flex min-h-[60vh] flex-col justify-end gap-16 sm:gap-24",
                "col-span-12",
                "xl:col-span-10 xl:col-start-2",
                "2xl:col-span-8 2xl:col-start-3"
              )}
            >
              <div ref={logoRef}>
                <Logo className="h-[36px] w-[144px] md:h-[48px] md:w-[192px]" />
              </div>
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
                  <SignUpDropDownButton
                    buttonLabel="Start with Dust Now"
                    onClickGoogle={() =>
                      signIn("google", {
                        callbackUrl: getCallbackUrl(router.query),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </Grid>
          <Grid className="items-center">
            <ReactiveImg
              className={classNames(
                "col-span-12",
                "sm:col-span-10 sm:col-start-2",
                "lg:col-span-7 lg:col-start-auto lg:row-span-4",
                "xl:col-span-6 xl:col-start-2",
                "2xl:col-span-5 2xl:col-start-3"
              )}
            >
              <img src="/static/landing/conversation.png" />
            </ReactiveImg>
            <div
              ref={scrollRef0}
              id="sectionProduct"
              className={classNames(
                "col-span-9",
                "sm:col-span-6",
                "lg:col-span-5",
                "xl:col-span-4",
                "2xl:col-span-3"
              )}
            >
              <P dotCSS="bg-sky-400">
                Deploy <Strong>the best Large Language Models</Strong> to&nbsp;
                <Strong>all&nbsp;your&nbsp;company</Strong>,
                <br className="hidden sm:block" />
                today.
              </P>
            </div>
            <P
              dotCSS="bg-amber-300"
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
              dotCSS="bg-red-400"
              className={classNames(
                "col-span-9",
                "sm:col-span-6",
                "lg:col-span-5",
                "xl:col-span-4",
                "2xl:col-span-3"
              )}
            >
              Empower your teams with{" "}
              <Strong>assistants tailored to&nbsp;their needs</Strong> on
              concrete use&nbsp;cases.
            </P>
            <P
              dotCSS="bg-emerald-400"
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

          {/* Get state of the art*/}
          <Grid>
            <div
              ref={scrollRef1}
              className={classNames(
                defaultFlexClasses,
                "col-span-12",
                "lg:col-span-10 lg:col-start-2",
                "xl:col-span-8 xl:col-start-5 xl:text-right",
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
                  augmented with&nbsp; your&nbsp;company’s
                  internal&nbsp;information
                </Strong>
                .
              </P>
            </div>
          </Grid>

          {/* Get state of the art: Content*/}
          <Grid>
            <ReactiveImg
              className={classNames(
                "order-1 col-span-12",
                "sm:col-span-6",
                "xl:order-3 xl:col-span-5 xl:col-start-auto xl:row-span-3",
                "2xl:order-3 2xl:col-span-4 2xl:col-start-2 2xl:row-span-3"
              )}
            >
              <img src="/static/landing/connect.png" />
            </ReactiveImg>

            <P
              dotCSS="bg-sky-400"
              className={classNames(
                "order-2 col-span-12",
                "sm:col-span-6 sm:self-center",
                "xl:order-1 xl:col-span-6 xl:col-start-auto xl:self-end",
                "2xl:order-1 2xl:col-span-5  2xl:col-start-2 2xl:self-end"
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
                "flex w-full flex-wrap justify-center gap-4",
                "order-3 col-span-12",
                "sm:col-span-6 sm:justify-end",
                "xl:order-2 xl:col-span-6 xl:justify-start xl:self-start",
                "2xl:order-2 2xl:col-span-6"
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
              <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Github">
                <GithubWhiteLogo />
              </ReactiveIcon>
              <ReactiveIcon colorHEX="#1E3A8A" tooltipLabel="Slack">
                <SlackLogo />
              </ReactiveIcon>
              <ReactiveIcon
                colorHEX="#1E3A8A"
                className="xl:hidden 2xl:block"
                tooltipLabel="More coming…"
              >
                <MoreIcon className="text-slate-50" />
              </ReactiveIcon>
            </div>
            <P
              dotCSS="bg-sky-400"
              className={classNames(
                "order-4 col-span-12",
                "sm:col-span-6 sm:self-center",
                "xl:order-4 xl:col-start-7 xl:self-start",
                "2xl:col-span-5 2xl:col-start-7"
              )}
            >
              With the support of&nbsp;multiple sources of&nbsp;data
              and&nbsp;models,{" "}
              <Strong>
                Dust is&nbsp; exceptionally modular and&nbsp;adaptable
              </Strong>
              , tailoring to&nbsp;your unique requirements,
              continuously&nbsp;evolving to&nbsp;meet
              your&nbsp;changing&nbsp;needs .
            </P>
            <div
              className={classNames(
                "flex w-full flex-wrap justify-center gap-4",
                "order-5 col-span-12",
                "sm:col-span-6 sm:justify-end",
                "xl:order-5 xl:col-start-7 xl:justify-start"
              )}
            >
              <ReactiveIcon
                colorHEX="#A26BF7"
                tooltipLabel="OpenAI, GPT3.5 and GPT4"
              >
                <OpenaiLogo />
              </ReactiveIcon>
              <ReactiveIcon colorHEX="#D4A480" tooltipLabel="Anthropic Claude">
                <AnthropicLogo />
              </ReactiveIcon>
              <ReactiveIcon colorHEX="#1A1C20" tooltipLabel="Mistral 7B">
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
              dotCSS="bg-sky-400"
              className={classNames(
                "order-6 col-span-12",
                "sm:order-5 sm:col-span-6 sm:self-center",
                "xl:col-start-7 xl:self-start",
                "2xl:col-span-5 2xl:col-start-7"
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
              ref={scrollRef2}
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
                  team&nbsp;members, develop and&nbsp;share
                  their&nbsp;experience with&nbsp;AI throughout
                  your&nbsp;company.
                </Strong>
              </P>
            </div>
          </Grid>

          {/* Bring your team: Content*/}
          <Grid verticalAlign="center">
            <ReactiveImg
              className={classNames(
                "order-1",
                "col-span-12",
                "sm:col-span-10 sm:col-start-2",
                "md:col-span-8 md:col-start-auto",
                "lg:order-1 lg:col-span-7 lg:row-span-3 lg:self-end",
                "xl:col-span-6 xl:col-start-2",
                "2xl:order-1 2xl:col-span-5 2xl:col-start-3 2xl:row-span-2 2xl:self-start"
              )}
            >
              <img src="/static/landing/builder.png" />
            </ReactiveImg>

            <ReactiveImg
              className={classNames(
                "order-2",
                "col-span-6 row-span-3 hidden sm:block",
                "md:col-span-6",
                "lg:row-span-auto lg:order-5 lg:col-span-4 lg:col-start-auto lg:self-start",
                "xl:col-start-2",
                "2xl:order-3 2xl:col-span-3 2xl:col-start-auto"
              )}
            >
              <img src="/static/landing/assistants.png" />
            </ReactiveImg>

            <P
              dotCSS="bg-amber-300"
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
              dotCSS="bg-amber-300"
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
              dotCSS="bg-amber-300"
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

            <ReactiveImg
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
            </ReactiveImg>
          </Grid>

          {/* Design for security */}
          <Grid>
            <div
              ref={scrollRef3}
              className="col-span-12 md:col-span-6 md:row-span-2 xl:col-span-5 xl:col-start-2"
            >
              <H2 className="text-red-400">
                Designed for security
                <br />
                <span className="text-red-200">and data privacy.</span>
              </H2>
            </div>
            <P size="lg" className="col-span-6 xl:col-span-5 2xl:col-span-4">
              <Strong>Your data is private</Strong>, No re-training
              of&nbsp;models on your internal knowledge.
            </P>
            <P size="lg" className="col-span-6 xl:col-span-5 2xl:col-span-4">
              <Strong>Enterprise-grade security</Strong> to manage
              your&nbsp;data access policies with control and&nbsp;confidence.
            </P>
          </Grid>

          {/* Need more? */}
          <Grid>
            <H2 className="order-1 col-span-12 text-emerald-500 md:col-span-6 xl:col-span-5  xl:col-start-2">
              Need more?
              <br />
              <span className="text-emerald-200">Dust do it!</span>
            </H2>
            <ReactiveImg
              paddingCSS="p-1"
              className={classNames(
                "order-2",
                "col-span-10 col-start-2",
                "sm:col-span-8 sm:col-start-3",
                "md:col-span-6 md:col-start-auto md:row-span-3 md:self-center",
                "xl:col-span-5",
                "2xl:col-span-4"
              )}
            >
              <img src="/static/landing/apps.png" />
            </ReactiveImg>
            <P
              size="lg"
              className="order-3 col-span-6 lg:col-span-5 xl:col-start-2"
            >
              Provide{" "}
              <Strong>developers and tinkerers with a&nbsp;platform</Strong>{" "}
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
          {/* <Grid className="md:hidden">
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-12 sm:col-span-10 sm:col-start-2"
              )}
            >
              <H2 className="text-pink-400">
                Want to start with Dust?
                <br />
                <span className="text-pink-200">
                  Come check us out on a larger screen!
                </span>
              </H2>
              <P size="lg">
                We're excited for you to explore our price plans and start
                your&nbsp;onboarding journey. For the&nbsp;optimal experience,
                please return on a&nbsp;device with a bigger&nbsp;screen.
              </P>
            </div>
          </Grid> */}
          <Grid>
            <div
              ref={scrollRef4}
              id="sectionPricing"
              className="col-span-12 text-center md:pb-6 xl:pb-10"
            >
              <H2 className="text-slate-50">
                Start with Dust!
                <br />
                <span className="text-slate-200/50">
                  Meet our pricing plans.
                </span>
              </H2>
            </div>
            <div className="s-dark col-span-12 flex flex-row justify-center lg:px-2 2xl:px-24">
              <PricePlans size="xs" className="lg:hidden" isTabs />
              <PricePlans size="xs" className="hidden lg:flex xl:hidden" />
              <PricePlans size="sm" className="hidden xl:flex" />
            </div>
          </Grid>
          {/* 
          <Grid className="hidden md:grid">
            <H2
              className={classNames(
                "text-amber-400",
                "col-span-12",
                "xl:col-span-8 xl:col-start-2"
              )}
            >
              Our product constitution
            </H2>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-6",
                "xl:col-span-4 xl:col-start-2",
                "2xl:col-span-3 2xl:col-start-3"
              )}
            >
              <H4 className="text-slate-200">
                Augmenting humans, not&nbsp;replacing&nbsp;them
              </H4>
              <P>
                We're optimistic about making work life better for smart people.
                We're building R2-D2, not Skynet.
              </P>
            </div>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-6",
                "md:col-span-6",
                "xl:col-span-3"
              )}
            >
              <H4 className="text-slate-200">Hard problems over&nbsp;hype</H4>
              <P>
                There's more to do than wrapping GPT into a chat UI. We're in
                this to solve hard problems on user experience and product
                quality.
              </P>
            </div>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-6",
                "xl:col-span-3"
              )}
            >
              <H4 className="text-slate-200">
                Building with an&nbsp;AI&nbsp;core
              </H4>
              <P>
                We're building with large language models in mind from the
                ground up, rather than sprinkling them here and&nbsp;there.
              </P>
            </div>
          </Grid> */}
        </div>

        <Footer />
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaTrackingId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
             window.dataLayer = window.dataLayer || [];
             function gtag(){window.dataLayer.push(arguments);}
             gtag('js', new Date());

             gtag('config', '${gaTrackingId}');
            `}
          </Script>
        </>
      </main>
    </>
  );
}

const Header = () => {
  return (
    <Head>
      <title>
        Dust - Amplify your team's potential with customizable and secure AI
        assistants
      </title>
      <link rel="shortcut icon" href="/static/favicon.png" />

      <meta name="apple-mobile-web-app-title" content="Dust" />
      <link rel="apple-touch-icon" href="/static/AppIcon.png" />
      <link
        rel="apple-touch-icon"
        sizes="60x60"
        href="/static/AppIcon_60.png"
      />
      <link
        rel="apple-touch-icon"
        sizes="76x76"
        href="/static/AppIcon_76.png"
      />
      <link
        rel="apple-touch-icon"
        sizes="120x120"
        href="/static/AppIcon_120.png"
      />
      <link
        rel="apple-touch-icon"
        sizes="152x152"
        href="/static/AppIcon_152.png"
      />
      <link
        rel="apple-touch-icon"
        sizes="167x167"
        href="/static/AppIcon_167.png"
      />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/static/AppIcon_180.png"
      />
      <link
        rel="apple-touch-icon"
        sizes="192x192"
        href="/static/AppIcon_192.png"
      />
      <link
        rel="apple-touch-icon"
        sizes="228x228"
        href="/static/AppIcon_228.png"
      />

      <meta
        id="meta-description"
        name="description"
        content="Dust is an AI assistant that safely brings the best large language models, continuously updated company knowledge, powerful collaboration applications, and an extensible platform to your team's fingertips."
      />
      <meta
        id="og-title"
        property="og:title"
        content="Dust - Secure AI assistant with your company's knowledge"
      />
      <meta id="og-image" property="og:image" content="/static/og_image.png" />

      <link rel="stylesheet" href="https://use.typekit.net/lzv1deb.css"></link>
    </Head>
  );
};

const Footer = () => {
  return (
    <div className="z-11 mt-12 flex w-full flex-col items-center gap-6 border-b border-t border-slate-800 bg-slate-900 py-16">
      <div className="w-full md:mx-12">
        <Grid>
          <div
            className={classNames(
              "opacity-70",
              "col-span-12",
              "md:col-span-3",
              "xl:col-start-2"
            )}
          >
            <LogoHorizontalWhiteLogo className="h-6 w-24" />
          </div>

          <div
            className={classNames(
              "flex flex-col gap-3",
              "col-span-6",
              "sm:col-span-3",
              "md:col-start-1",
              "xl:col-span-2 xl:col-start-4 "
            )}
          >
            <P>
              <Strong>Careers</Strong>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="https://www.notion.so/dust-tt/Jobs-a67e20f0dc2942fdb77971b73251466e/">
                  Jobs
                </Link>
              </A>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="https://www.linkedin.com/company/dust-tt/">
                  LinkedIn
                </Link>
              </A>
            </P>
          </div>
          <div
            className={classNames(
              "flex flex-col gap-3",
              "col-span-6",
              "sm:col-span-3",
              "xl:col-span-2"
            )}
          >
            <P>
              <Strong>About</Strong>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="https://blog.dust.tt/">Blog</Link>
              </A>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="https://x.com/dust4ai">@dust4ai</Link>
              </A>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="https://github.com/dust-tt">GitHub</Link>
              </A>
            </P>
          </div>
          <div
            className={classNames(
              "flex flex-col gap-3",
              "col-span-6",
              "sm:col-span-3",
              "xl:col-span-2"
            )}
          >
            <P>
              <Strong>Privacy</Strong>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="/website-privacy">Website Privacy Policy</Link>
              </A>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="/platform-privacy">Platform Privacy Policy</Link>
              </A>
            </P>
          </div>
          <div
            className={classNames(
              "flex flex-col gap-3",
              "col-span-6",
              "sm:col-span-3",
              "xl:col-span-2"
            )}
          >
            <P>
              <Strong>Legal</Strong>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="https://dust-tt.notion.site/Legal-Notice-58b453f74d634ef7bb807d29a59b3db1">
                  Legal Notice
                </Link>
              </A>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="/terms">Terms of Use</Link>
              </A>
            </P>
            <P size="xs">
              <A variant="tertiary">
                <Link href="https://dust-tt.notion.site/Cookie-Policy-ec63a7fb72104a7babff1bf413e2c1ec">
                  Cookies Policy
                </Link>
              </A>
            </P>
          </div>
        </Grid>
      </div>
    </div>
  );
};
