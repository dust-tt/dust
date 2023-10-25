import {
  AnthropicLogo,
  Button,
  DriveLogo,
  GithubWhiteLogo,
  GoogleLogo,
  HuggingFaceLogo,
  LightbulbIcon,
  Logo,
  LogoHorizontalWhiteLogo,
  MicrosoftLogo,
  MistralLogo,
  MoreIcon,
  NotionLogo,
  OpenaiLogo,
  PriceTable,
  RocketIcon,
  SlackLogo,
  SparklesIcon,
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
  Grid,
  H1,
  H2,
  H3,
  H4,
  P,
  ReactiveIcon,
  ReactiveImg,
  Strong,
} from "@app/components/home/contentComponents";

const defaultFlexClasses = "flex flex-col gap-4";

import { GoogleSignInButton } from "@app/components/Button";
import Particles from "@app/components/home/particles";
import ScrollingHeader from "@app/components/home/scrollingHeader";
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
  const [hasScrolled, setHasScrolled] = useState<boolean>(false);

  const scrollRef1 = useRef<HTMLDivElement | null>(null);
  const scrollRef2 = useRef<HTMLDivElement | null>(null);
  const scrollRef3 = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logoRef.current) {
      const logoPosition = logoRef.current.offsetTop;
      setLogoY(logoPosition);
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setHasScrolled(currentScrollY > 600);
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
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
        <div className="flex h-full w-full items-center px-4">
          <Logo className="logo invisibleFirst hidden h-[24px] w-[96px] opacity-0 transition-all duration-500 ease-out md:block" />
          <div className="flex-grow" />
          <div className="flex items-center gap-2">
            {!(router.query.signIn && router.query.signIn !== "github") && (
              <div className="font-regular font-objektiv text-xs text-slate-400">
                Sign in with{" "}
                <span
                  className="cursor-pointer font-bold hover:text-blue-400"
                  onClick={() => {
                    void signIn("github", {
                      callbackUrl: getCallbackUrl(router.query),
                    });
                  }}
                >
                  GitHub
                </span>{" "}
                or
              </div>
            )}
            <GoogleSignInButton
              onClick={() =>
                signIn("google", {
                  callbackUrl: getCallbackUrl(router.query),
                })
              }
            >
              <img src="/static/google_white_32x32.png" className="h-4 w-4" />
              <span className="ml-2 mr-1">Sign in with Google</span>
            </GoogleSignInButton>
          </div>
        </div>
      </ScrollingHeader>

      {/* Keeping the background dark */}
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-900" />
      {/* Particle system */}
      <div
        className={classNames(
          "fixed bottom-0 left-0 right-0 top-0 -z-40 overflow-hidden transition duration-[1000ms]",
          hasScrolled ? "opacity-30" : "opacity-100"
        )}
      >
        <Particles
          scrollRef1={scrollRef1}
          scrollRef2={scrollRef2}
          scrollRef3={scrollRef3}
        />
      </div>

      <main className="z-10 flex flex-col items-center">
        <div className="max-w-8xl container flex flex-col gap-36 py-36">
          <Grid>
            <div className="col-span-8 col-start-3 flex min-h-[60vh] flex-col justify-end gap-24">
              <div ref={logoRef}>
                <Logo className="h-[48px] w-[192px]" />
              </div>
              <div className="flex flex-col gap-12">
                <H1>
                  <span className="text-red-400 sm:font-objektiv md:font-objektiv">
                    Amplify your team's potential
                  </span>{" "}
                  <br />
                  with customizable and secure AI&nbsp;assistants.
                </H1>
                <H3 className="col-span-6 col-start-3">
                  AI is changing the way we work.
                  <br />
                  Effectively channeling the potential of AI is a competitive
                  edge.
                </H3>
                <div className="flex w-full flex-col items-start">
                  <Button
                    variant="primary"
                    size="lg"
                    label="Start with Dust now"
                    icon={RocketIcon}
                  />
                </div>
              </div>
            </div>
          </Grid>
          <Grid className="items-center">
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-4 col-start-3 gap-8"
              )}
            >
              <P border="sky">
                Deploy <Strong>the best Large Language Models</Strong> to{" "}
                <Strong>all&nbsp;your&nbsp;company</Strong>, today.
              </P>
              <P border="amber">
                Connect Dust to <Strong>your team’s data</Strong> and{" "}
                <Strong>break down knowledge silos</Strong> with context aware
                assistants.
              </P>
              <P border="red">
                Empower your teams with{" "}
                <Strong>assistants tailored to&nbsp;their needs</Strong> on
                concrete use&nbsp;cases.
              </P>
              <P border="emerald">
                <Strong>Control granularly data access</Strong> with a{" "}
                <Strong>safe and privacy-obsessed</Strong> application.
              </P>
            </div>
            <div className="col-span-5">
              <ReactiveImg>
                <img src="/static/landing/conversation.png" />
              </ReactiveImg>
            </div>
          </Grid>

          <Grid>
            <div
              ref={scrollRef1}
              className={classNames(
                defaultFlexClasses,
                "col-span-8 col-start-3 flex flex-col gap-4 text-right"
              )}
            >
              <H1 color="text-sky-500">
                Get the state of the&nbsp;art,
                <br />
                <H1 isSpan color="text-sky-200">
                  today and&nbsp;tomorrow.
                </H1>
              </H1>
              <P variant="big">
                Dust gives you&nbsp;access to the&nbsp;
                <Strong>leading models</Strong>,<br />
                and&nbsp; augments them with&nbsp;
                <Strong>your&nbsp;company’s internal&nbsp;information</Strong>.
              </P>
            </div>
          </Grid>
          <Grid>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-5 col-start-3 gap-8"
              )}
            >
              <P border="pink">
                <Strong>Modular and composable</Strong>, Dust is&nbsp;deeply
                customizable to&nbsp;your&nbsp;exact needs and will&nbsp;evolve
                as those&nbsp;needs&nbsp;evolve.
              </P>
              <div className="flex flex-wrap gap-4 pl-6">
                <ReactiveIcon colorHEX="#A26BF7">
                  <OpenaiLogo />
                </ReactiveIcon>
                <ReactiveIcon colorHEX="#D4A480">
                  <AnthropicLogo />
                </ReactiveIcon>
                <ReactiveIcon colorHEX="#1A1C20">
                  <MistralLogo />
                </ReactiveIcon>
                <ReactiveIcon colorHEX="#3A3B45">
                  <HuggingFaceLogo />
                </ReactiveIcon>
                <ReactiveIcon colorHEX="#1E3A8A">
                  <MicrosoftLogo />
                </ReactiveIcon>
              </div>
              <P border="emerald">
                Proprietary and&nbsp;open-source models suited
                to&nbsp;your&nbsp;needs:{" "}
                <Strong>OpenAI,&nbsp;Anthropic,&nbsp;Mistral…</Strong>
              </P>
              <div className="flex flex-wrap gap-4 pl-6">
                <ReactiveIcon colorHEX="#1E3A8A">
                  <GoogleLogo />
                </ReactiveIcon>
                <ReactiveIcon colorHEX="#1E3A8A">
                  <DriveLogo />
                </ReactiveIcon>
                <ReactiveIcon colorHEX="#1E3A8A">
                  <NotionLogo />
                </ReactiveIcon>
                <ReactiveIcon colorHEX="#1E3A8A">
                  <GithubWhiteLogo />
                </ReactiveIcon>
                <ReactiveIcon colorHEX="#1E3A8A">
                  <SlackLogo />
                </ReactiveIcon>
                <ReactiveIcon colorHEX="#1E3A8A">
                  <MoreIcon className="text-slate-50" />
                </ReactiveIcon>
              </div>
              <P border="sky">
                Your own knowledge base continuously in&nbsp;sync:{" "}
                <Strong>
                  Notion, Slack, GitHub, Google&nbsp;Drive, and&nbsp;more
                </Strong>
                .
              </P>
            </div>
            <div className="test-right col-span-4 flex h-full flex-col justify-center gap-6">
              <ReactiveImg>
                <img src="/static/landing/connect.png" />
              </ReactiveImg>
            </div>
          </Grid>
          <Grid>
            <div
              ref={scrollRef2}
              className={classNames(
                defaultFlexClasses,
                "col-span-8 col-start-3 flex flex-col gap-4"
              )}
            >
              <H2 color="text-amber-400">
                Bring your&nbsp;team
                <br />
                <H2 isSpan color="text-amber-100">
                  up&nbsp;to&nbsp;speed.
                </H2>
              </H2>
              <P variant="big">
                Embracing AI is a&nbsp;
                <Strong>
                  paradigm shift for&nbsp;your team’s&nbsp;workflows
                </Strong>
                .
              </P>
              <P variant="big">
                Dust empowers{" "}
                <Strong>your most creative and driven team members</Strong>{" "}
                to&nbsp;<Strong>develop and&nbsp;share</Strong>{" "}
                their&nbsp;practices throughout your&nbsp;company.
              </P>
            </div>
          </Grid>
          <Grid>
            <div className="col-span-6 col-start-2">
              <ReactiveImg>
                <img src="/static/landing/builder.png" />
              </ReactiveImg>
            </div>
            <div
              className={classNames(defaultFlexClasses, "col-span-4 gap-16")}
            >
              <P border="sky">
                Team members <Strong>imagine new workflows</Strong> and&nbsp;
                <Strong>package them with assistants</Strong> that&nbsp;others
                can&nbsp;effortlessly&nbsp;use.
              </P>
              <div className="w-[75%] pl-4">
                <ReactiveImg>
                  <img src="/static/landing/assistants.png" />
                </ReactiveImg>
              </div>
            </div>
            <div
              className={classNames(
                "col-span-3 col-start-3 flex flex-col justify-center gap-10"
              )}
            >
              <P border="amber">
                Spread good practices &&nbsp;encourage collaboration with{" "}
                <Strong>conversation sharing</Strong>,{" "}
                <Strong>@mentions in&nbsp;Dust conversations</Strong> and{" "}
                <Strong>Slack&nbsp;integration</Strong>.
              </P>
              <P border="pink">
                Manage workspace invitations seamlessly&nbsp;with{" "}
                <Strong>single sign&#8209;on</Strong>&nbsp;(SSO).
              </P>
            </div>
            <div className="col-span-6">
              <ReactiveImg>
                <div className="rounded-xl">
                  <img src="/static/landing/slack.png" />
                </div>
              </ReactiveImg>
            </div>
          </Grid>
          <Grid>
            <div
              ref={scrollRef3}
              className={classNames(
                defaultFlexClasses,
                "col-span-5 col-start-2 flex flex-col gap-4 text-right"
              )}
            >
              <H2 color="text-red-400">
                Designed for security
                <br />
                <H2 isSpan color="text-red-200">
                  and data privacy.
                </H2>
              </H2>
            </div>
            <div className="col-span-4 flex flex-col gap-4">
              <P variant="big">
                <Strong>Your data is private</Strong>, No re-training
                of&nbsp;models on your internal knowledge.
              </P>
              <P variant="big">
                <Strong>Enterprise-grade security</Strong> to manage
                your&nbsp;data access policies with control and&nbsp;confidence.
              </P>
            </div>
          </Grid>
          <Grid>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-4 col-start-3 flex flex-col gap-4"
              )}
            >
              <div className="w-full pt-12">
                <ReactiveImg paddingCSS="p-1">
                  <img src="/static/landing/apps.png" />
                </ReactiveImg>
              </div>
            </div>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-5 flex flex-col gap-8"
              )}
            >
              <H2 color="text-emerald-500">
                Need more?
                <br />
                <H2 isSpan color="text-emerald-200">
                  Dust do it!
                </H2>
              </H2>
              <P variant="big">
                Provide{" "}
                <Strong>developers and tinkerers with a&nbsp;framework</Strong>{" "}
                to&nbsp;build custom actions and&nbsp;application orchestration
                to&nbsp;fit your team’s&nbsp;exact&nbsp;needs.
              </P>
              <P variant="big">
                Support <Strong>custom plugins</Strong> for assistants to
                interact with your{" "}
                <Strong>own databases on advanced use cases</Strong>.
              </P>
            </div>
          </Grid>
          <Grid>
            <div className="col-span-8 col-start-3">
              <H2 color="text-amber-400">
                Deal with Dust!
                <br />
                <H2 color="text-amber-100" isSpan>
                  Meet our pricing plans.
                </H2>
              </H2>
            </div>
            <div
              className={classNames(
                defaultFlexClasses,
                "s-dark dark col-span-10 col-start-2 flex flex-col gap-4"
              )}
            >
              <div className="flex flex-row gap-10">
                <PriceTable
                  title="Free"
                  price="$0"
                  priceLabel=""
                  color="emerald"
                  size="sm"
                  magnified={false}
                >
                  <PriceTable.Item label="One user" variant="dash" />
                  <PriceTable.Item label="One workspace" variant="dash" />
                  <PriceTable.Item label="Privacy and Data Security" />
                  <PriceTable.Item label="Advanced LLM models (GPT-4, Claude, …)" />
                  <PriceTable.Item label="Unlimited custom assistants" />
                  <PriceTable.Item
                    label="100 messages with Assistants"
                    variant="dash"
                  />
                  <PriceTable.Item
                    label="50 documents as data sources"
                    variant="dash"
                  />
                  <PriceTable.Item label="No connections" variant="xmark" />
                  <PriceTable.ActionContainer>
                    <Button
                      variant="primary"
                      size="lg"
                      label="Start testing"
                      icon={LightbulbIcon}
                    />
                  </PriceTable.ActionContainer>
                </PriceTable>

                <PriceTable
                  title="Pro"
                  price="$29"
                  color="sky"
                  priceLabel="/ month / seat"
                  size="sm"
                  magnified={false}
                >
                  <PriceTable.Item label="From 1 user" />
                  <PriceTable.Item label="One workspace" variant="dash" />
                  <PriceTable.Item label="Privacy and Data Security" />
                  <PriceTable.Item label="Advanced LLM models (GPT-4, Claude, …)" />
                  <PriceTable.Item label="Unlimited custom assistants" />
                  <PriceTable.Item label="Unlimited messages" />
                  <PriceTable.Item label="Up to 1Go/user of data sources" />
                  <PriceTable.Item
                    label="Connections
(GitHub, Google Drive, Notion, Slack)"
                  />
                  <PriceTable.Item label="Single Sign-on (Google, GitHub)" />
                  <PriceTable.Item label="Dust Slackbot" />
                  <PriceTable.Item label="Assistants can execute actions" />
                  <PriceTable.Item
                    label="Workspace role and permissions"
                    variant="dash"
                  />
                  <PriceTable.ActionContainer>
                    <Button
                      variant="primary"
                      size="lg"
                      label="Start now"
                      icon={RocketIcon}
                    />
                  </PriceTable.ActionContainer>
                </PriceTable>

                <PriceTable
                  title="Enterprise"
                  price="Custom"
                  size="sm"
                  magnified={false}
                >
                  <PriceTable.Item label="From 100 users" />
                  <PriceTable.Item label="Multiple workspaces" />
                  <PriceTable.Item label="Privacy and Data Security" />
                  <PriceTable.Item label="Advanced LLM models (GPT-4, Claude, …)" />
                  <PriceTable.Item label="Unlimited custom assistants" />
                  <PriceTable.Item label="Unlimited messages" />
                  <PriceTable.Item label="Unlimited data sources" />
                  <PriceTable.Item
                    label="Connections
(GitHub, Google Drive, Notion, Slack)"
                  />
                  <PriceTable.Item label="Single Sign-on" />
                  <PriceTable.Item label="Dust Slackbot" />
                  <PriceTable.Item label="Assistants can execute actions" />
                  <PriceTable.Item label="Advanced workspace role and permissions" />
                  <PriceTable.Item label="Dedicated account support" />
                  <PriceTable.ActionContainer>
                    <Button
                      variant="primary"
                      size="lg"
                      label="Contact us"
                      icon={SparklesIcon}
                    />
                  </PriceTable.ActionContainer>
                </PriceTable>
              </div>
            </div>
          </Grid>
          <Grid>
            <H2 color="text-emerald-400 col-span-8 col-start-3">
              Our product constitution
            </H2>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-3 col-start-3"
              )}
            >
              <H4>Augmenting humans, not&nbsp;replacing&nbsp;them</H4>
              <P>
                We're optimistic about making work life better for smart people.
                We're building R2-D2, not Skynet.
              </P>
            </div>
            <div className={classNames(defaultFlexClasses, "col-span-3")}>
              <H4>Hard problems over&nbsp;hype</H4>
              <P>
                There's more to do than wrapping GPT into a chat UI. We're in
                this to solve hard problems on user experience and product
                quality.
              </P>
            </div>
            <div className={classNames(defaultFlexClasses, "col-span-3")}>
              <H4>Building with an&nbsp;AI&nbsp;core</H4>
              <P>
                We're building with large language models in mind from the
                ground up, rather than sprinkling them here and&nbsp;there.
              </P>
            </div>
          </Grid>
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
    <div className="mt-48 flex w-full flex-col gap-6 border-t border-slate-800 bg-slate-900 px-12 pb-20 pt-12">
      <div className="opacity-70">
        <LogoHorizontalWhiteLogo className="h-6 w-24" />
      </div>
      <div className="grid w-full gap-4 text-slate-200 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="https://dust-tt.notion.site/Legal-Notice-58b453f74d634ef7bb807d29a59b3db1">
          Legal
        </Link>
        <Link href="/website-privacy">Website Privacy</Link>
        <Link href="/platform-privacy">Platform Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="https://dust-tt.notion.site/Cookie-Policy-ec63a7fb72104a7babff1bf413e2c1ec">
          Cookies
        </Link>
      </div>
    </div>
  );
};
