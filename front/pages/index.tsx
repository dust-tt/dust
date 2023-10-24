import {
  AnthropicLogo,
  DriveLogo,
  GoogleLogo,
  Logo,
  NotionLogo,
  OpenaiLogo,
  PriceTable,
} from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import Script from "next/script";
import { signIn } from "next-auth/react";
import { ParsedUrlQuery } from "querystring";
import React, { ReactNode, useEffect, useRef, useState } from "react";

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

const defaultGridClasses = "grid grid-cols-12 gap-6";
const defaultFlexClasses = "flex flex-col gap-4";

export const Grid = ({
  children,
  color = "text-slate-50",
  className = "",
}: ContentProps) => (
  <div className={classNames(className, color, defaultGridClasses)}>
    {children}
  </div>
);

const hClasses = {
  h1: "font-objektiv text-4xl font-bold tracking-tight md:text-6xl drop-shadow-lg",
  h2: "font-objektiv text-3xl font-bold tracking-tight md:text-5xl drop-shadow-lg",
  h3: "font-objektiv text-xl font-bold tracking-tight md:text-2xl drop-shadow-md",
  h4: "font-objektiv text-lg font-bold tracking-tight md:text-xl drop-shadow-md",
};

const pClasses = {
  normal: "font-regular text-sm text-slate-400 md:text-lg drop-shadow",
  big: "font-regular text-lg text-slate-400 md:text-xl drop-shadow",
};

interface ContentProps {
  children: ReactNode;
  className?: string;
  variant?: string;
  color?: string;
  isSpan?: boolean;
}

type TagName = "h1" | "h2" | "h3" | "h4";

const createHeadingComponent = (Tag: TagName) => {
  const Component: React.FC<ContentProps> = ({
    children,
    color = "text-slate-50",
    className = "",
    isSpan = false,
  }) => {
    if (isSpan) {
      return <span className={classNames(className, color)}>{children}</span>;
    }
    return (
      <Tag className={classNames(className, color, hClasses[Tag])}>
        {children}
      </Tag>
    );
  };
  Component.displayName = Tag.toUpperCase();
  return Component;
};

export const H1 = createHeadingComponent("h1");
export const H2 = createHeadingComponent("h2");
export const H3 = createHeadingComponent("h3");
export const H4 = createHeadingComponent("h4");

export const P = ({ children, className = "", variant }: ContentProps) => (
  <p
    className={classNames(
      className,
      variant === "big" ? pClasses.big : pClasses.normal
    )}
  >
    {children}
  </p>
);

export const Strong = ({ children, className = "" }: ContentProps) => (
  <strong className={classNames(className, "font-medium text-slate-200")}>
    {children}
  </strong>
);

interface ReactImgProps {
  children: ReactNode;
  colorCSS?: string;
  containerPaddingCSS?: string;
  innerPaddingCSS?: string;
  className?: string;
  src?: string;
  isSmall?: boolean;
}

export const ReactiveImg = ({
  children,
  colorCSS = "border-slate-700/50 bg-slate-900/70",
  containerPaddingCSS = "p-6",
  innerPaddingCSS = "p-3",
  className = "",
  isSmall = false,
}: ReactImgProps) => {
  const singleChild = React.Children.only(children);

  if (!React.isValidElement(singleChild)) {
    console.error(
      "Invalid children for ReactiveImg. It must be a single React element."
    );
    return null;
  }

  const modifiedChild = React.cloneElement(
    singleChild as React.ReactElement<any, any>,
    {
      className: classNames(
        singleChild.props.className,
        "z-10",
        !isSmall
          ? "scale-100 transition-all duration-1000 ease-out group-hover:scale-105"
          : "scale-100 transition-all duration-700 ease-out group-hover:scale-125"
      ),
    }
  );

  return (
    <div className={classNames("group", containerPaddingCSS, className)}>
      <div
        className={classNames(
          colorCSS,
          innerPaddingCSS,
          "flex rounded-2xl border drop-shadow-[0_25px_25px_rgba(0,0,0,0.5)] backdrop-blur-sm",
          !isSmall
            ? "scale-100 transition-all duration-1000 ease-out group-hover:scale-105"
            : "scale-100 transition-all duration-700 ease-out group-hover:scale-110"
        )}
      >
        {modifiedChild}
      </div>
    </div>
  );
};

export const ReactiveIcon = ({ children, colorCSS }: ReactImgProps) => {
  const singleChild = React.Children.only(children);

  if (!React.isValidElement(singleChild)) {
    console.error(
      "Invalid children for ReactiveImg. It must be a single React element."
    );
    return null;
  }

  const modifiedChild = React.cloneElement(
    singleChild as React.ReactElement<any, any>,
    {
      className: classNames(
        singleChild.props.className,
        "h-10 w-10 drop-shadow-[0_5px_5px_rgba(0,0,0,0.4)]"
      ),
    }
  );
  return (
    <ReactiveImg
      colorCSS={colorCSS}
      className="w-fit"
      containerPaddingCSS="p-3"
      innerPaddingCSS="p-3.5"
      isSmall
    >
      {modifiedChild}
    </ReactiveImg>
  );
};

export default function Home({
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [logoY, setLogoY] = useState<number>(0);
  const logoRef = useRef<HTMLDivElement | null>(null);

  const scrollRef1 = useRef<HTMLDivElement | null>(null);
  const scrollRef2 = useRef<HTMLDivElement | null>(null);
  const scrollRef3 = useRef<HTMLDivElement | null>(null);

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
      <HeadComponent />
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
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-40 overflow-hidden">
        <Particles
          scrollRef1={scrollRef1}
          scrollRef2={scrollRef2}
          scrollRef3={scrollRef3}
        />
      </div>

      <main className="z-10 mx-6 flex flex-col items-center">
        <div className="container flex max-w-7xl flex-col gap-16">
          <Grid>
            <div className="col-span-8 col-start-3 flex flex-col gap-16">
              <div style={{ height: "24vh" }} />
              <div ref={logoRef}>
                <Logo className="h-[48px] w-[192px]" />
              </div>
              <H1>
                <span className="text-red-400 sm:font-objektiv md:font-objektiv">
                  Amplify your team's potential
                </span>{" "}
                <br />
                with customizable and secure AI&nbsp;assistants
              </H1>
              <H3 className="col-span-6 col-start-3">
                AI is changing the way we work.
                <br />
                Effectively channeling the potential of AI is a competitive
                edge.
              </H3>
            </div>
          </Grid>
          <Grid>
            <P className="col-span-4">
              Deploy <Strong>Large Language Models</Strong> on{" "}
              <Strong>concrete use cases</Strong> in your company{" "}
              <Strong>today</Strong>.
            </P>
            <P className="col-span-4">
              Empower teams with{" "}
              <Strong>assistants tailored to&nbsp;their needs</Strong>, using{" "}
              <Strong>the best models</Strong> augmented with{" "}
              <Strong>your company's knowledge</Strong>.
            </P>
            <P className="col-span-4">
              <Strong>Control granularly data access</Strong> with a{" "}
              <Strong>safe and privacy-obsessed</Strong> application.
            </P>
          </Grid>

          <Grid>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-8 col-start-3 flex flex-col gap-4"
              )}
            >
              <H2 color="text-sky-500">
                Get the state of the&nbsp;art,
                <br />
                <H2 isSpan color="text-sky-200">
                  today and&nbsp;tomorrow.
                </H2>
              </H2>
              <P variant="big">
                Dust gives you&nbsp;access to the&nbsp;
                <Strong>leading models</Strong>, and&nbsp; augments them
                with&nbsp;
                <Strong>your&nbsp;company’s internal&nbsp;information</Strong>.
              </P>
            </div>
          </Grid>
          <Grid>
            <div className="col-span-4">
              <ReactiveImg>
                <img src="/static/landing/connect.png" />
              </ReactiveImg>
              <P>
                Proprietary and&nbsp;open-source models suited
                to&nbsp;your&nbsp;needs:{" "}
                <Strong>OpenAI, Anthropic, Mistral…</Strong>
              </P>
            </div>
            <div className="col-span-4">
              <div className="flex flex-wrap gap-0">
                <ReactiveIcon colorCSS="bg-purple-400/80 border-purple-300/50">
                  <OpenaiLogo />
                </ReactiveIcon>
                <ReactiveIcon colorCSS="bg-purple-400/80 border-purple-300/50">
                  <AnthropicLogo />
                </ReactiveIcon>
                <ReactiveIcon colorCSS="bg-white/90 border-slate-200/50">
                  <GoogleLogo />
                </ReactiveIcon>
                <ReactiveIcon colorCSS="bg-white/90 border-slate-200/50">
                  <DriveLogo />
                </ReactiveIcon>
                <ReactiveIcon colorCSS="bg-white/90 border-slate-200/50">
                  <NotionLogo />
                </ReactiveIcon>
              </div>
              <img className="z-10 w-full" src="/static/landing/partners.png" />
              <P>
                Your own knowledge base continuously in&nbsp;sync:{" "}
                <Strong>
                  Notion, Slack, GitHub, Google Drive, and&nbsp;more
                </Strong>
                .
              </P>
            </div>
            <div className="col-span-4">
              <P>
                <Strong>Modular and composable</Strong>, Dust is&nbsp;deeply
                customizable to&nbsp;your exact needs and will evolve as
                those&nbsp;needs evolve.
              </P>
            </div>
          </Grid>
          <Grid>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-8 col-start-3 flex flex-col gap-4 text-right"
              )}
            >
              <H2 color="text-red-400">
                Bring your&nbsp;team
                <br />
                <H2 isSpan color="text-red-200">
                  up&nbsp;to&nbsp;speed.
                </H2>
              </H2>
              <P variant="big">
                Embracing AI is a&nbsp;paradigm shift for&nbsp;your
                team’s&nbsp;workflows.
                <br />
                Dust empowers{" "}
                <Strong>your most creative and driven team members</Strong>{" "}
                to&nbsp;<Strong>develop and&nbsp;share</Strong> their practices
                throughout your&nbsp;company.
              </P>
            </div>
          </Grid>
          <Grid>
            <P className="col-span-4">
              Team members can <Strong>imagine and build new workflows</Strong>,
              package them in an{" "}
              <Strong>easy to&nbsp;use / easy to&nbsp;share</Strong> assistants.
            </P>
            <P className="col-span-4">
              Spread good practices &&nbsp;encourage collaboration with
              <Strong>@mentions in&nbsp;Dust conversations</Strong> and{" "}
              <Strong>Slack&nbsp;integration</Strong>.
            </P>
            <P className="col-span-4">
              Seamlessly manage workspace invitations with{" "}
              <Strong>single sign-on</Strong>&nbsp;(SSO).
            </P>
          </Grid>

          <Grid>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-6 flex flex-col gap-4"
              )}
            >
              <H2 color="text-emerald-500">
                Designed for security
                <br />
                <H2 isSpan color="text-emerald-200">
                  and data privacy.
                </H2>
              </H2>
              <P>
                <Strong>Your data is private</Strong>: No re-training
                of&nbsp;models on your internal knowledge.{" "}
                <Strong>Enterprise-grade security</Strong> to manage
                your&nbsp;data access policies with control and&nbsp;confidence.
                <br />
              </P>
            </div>
            <div
              className={classNames(
                defaultFlexClasses,
                "col-span-6 flex flex-col gap-4"
              )}
            >
              <H2 color="text-amber-500">
                Need more?
                <br />
                <H2 isSpan color="text-amber-200">
                  Dust do it!
                </H2>
              </H2>
              <P>
                Built for <Strong>developers</Strong> and{" "}
                <Strong>tinkerers</Strong> with powerful{" "}
                <Strong>actions and application orchestration</Strong> to fit
                your exact needs. Build <Strong>custom actions</Strong>, connect
                them with 3rd party APIs, chain them with assistants.
              </P>
            </div>
          </Grid>
          <Grid>
            <div
              className={classNames(
                defaultFlexClasses,
                "s-dark dark col-span-12 flex flex-col gap-4"
              )}
            >
              <H2>Pricing</H2>
              <PriceTable.Container>
                <PriceTable
                  title="Free"
                  price="0€"
                  priceLabel="/ month"
                  color="amber"
                  className="w-64"
                >
                  <PriceTable.Item
                    label="Single member / workspace"
                    variant="dash"
                  />
                  <PriceTable.Item label="Unlimited custom assistants" />
                  <PriceTable.Item label="Advanced LLM models (gpt4, Claude, ...)" />
                  <PriceTable.Item label="20 messages a week" variant="dash" />
                  <PriceTable.Item
                    label="Static Data Sources (35Mo)"
                    variant="dash"
                  />
                  <PriceTable.Item
                    label="Connected Data Sources"
                    variant="xmark"
                  />
                </PriceTable>
                <PriceTable
                  title="Pro"
                  price="0€"
                  priceLabel="/ month"
                  className="w-64"
                  color="emerald"
                >
                  <PriceTable.Item
                    label="Single member / workspace"
                    variant="dash"
                  />
                  <PriceTable.Item label="Unlimited custom assistants" />
                  <PriceTable.Item label="Advanced LLM models (gpt4, Claude, ...)" />
                  <PriceTable.Item label="20 messages a week" variant="dash" />
                  <PriceTable.Item
                    label="Static Data Sources (35Mo)"
                    variant="dash"
                  />
                  <PriceTable.Item
                    label="Connected Data Sources"
                    variant="xmark"
                  />
                </PriceTable>
                <PriceTable
                  title="Team"
                  price="0€"
                  color="sky"
                  priceLabel="/ month / seat"
                  className="w-64"
                >
                  <PriceTable.Item label="Unlimited members / workspace" />
                  <PriceTable.Item label="Unlimited custom assistants" />
                  <PriceTable.Item label="Advanced LLM models (gpt4, Claude, ...)" />
                  <PriceTable.Item label="1 user" />
                  <PriceTable.Item label="1 user" />
                  <PriceTable.Item label="1 user" />
                  <PriceTable.Item label="1 user" />
                </PriceTable>
                <PriceTable title="Enterprise" price="Custom" className="w-64">
                  <PriceTable.Item label="Unlimited members / workspace" />
                  <PriceTable.Item label="Unlimited workspaces" />
                  <PriceTable.Item label="Unlimited custom assistants" />
                  <PriceTable.Item label="1 user" />
                  <PriceTable.Item label="1 user" />
                  <PriceTable.Item label="1 user" />
                  <PriceTable.Item label="1 user" />
                  <PriceTable.Item label="1 user" />
                </PriceTable>
              </PriceTable.Container>
            </div>
          </Grid>
        </div>
        <div
          ref={scrollRef1}
          className="mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl"
        >
          <div className="mt-32">
            <div className="gap-8 md:grid md:grid-cols-8">
              <div className="flex flex-col justify-center self-center text-left md:col-span-4 md:pr-8">
                <div
                  className="mt-2"
                  style={{
                    filter: "drop-drop-shadow(0 10px 8px rgb(0 0 0 / 0.3))",
                  }}
                >
                  <div className="font-objektiv text-xl font-bold tracking-tighter text-red-400 md:text-2xl">
                    GPT-4 and all your internal knowledge, <br />
                    <span className="text-3xl text-rose-200 md:text-5xl">
                      combined
                    </span>
                    .
                  </div>
                  <p className="font-regular text-md mt-4 font-objektiv text-slate-300 md:text-lg">
                    Use Dust for unified and safe access to GPT-4.
                  </p>
                  <p className="font-regular text-md mt-4 font-objektiv text-slate-300 md:text-lg">
                    Connect Dust to your team’s data and break down knowledge
                    silos with always up-to-date answers
                    in&nbsp;a&nbsp;chat&nbsp;UI.
                  </p>
                </div>
                <div className="flex flex-1"></div>
              </div>
              <div className="mt-8 md:col-span-4 md:mt-0">
                <div className="z-10mx-auto overflow-hidden ">
                  <img
                    className="z-10 mx-auto w-[500px] rotate-2"
                    src="/static/landing_data_sources.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div ref={scrollRef2} className="mt-16">
            <div className="gap-8 md:grid md:grid-cols-8">
              <div className="order-1 flex flex-col justify-center self-center text-left md:order-2 md:col-span-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="font-objektiv text-xl font-bold tracking-tighter text-emerald-500 md:text-2xl">
                    Get your teams <br />
                    <span className="text-3xl text-green-300 md:text-5xl">
                      up to speed
                    </span>{" "}
                    on AI.
                  </div>
                  <p className="font-regular text-md mt-4 font-objektiv text-slate-300 md:text-lg">
                    Let your team share prompts and conversations to ramp up on
                    the potential of generative AI for their tasks.
                  </p>
                  <p className="font-regular text-md mt-4 font-objektiv text-slate-300 md:text-lg">
                    Get suggestions from Dust on documentation updates and
                    improvements based on ongoing internal conversations and
                    decisions.
                  </p>
                </div>
                <div className="flex flex-1"></div>
              </div>
              <div className="order-2 mt-8 md:order-1 md:col-span-4 md:mt-0">
                <div className="mx-auto">
                  <img
                    className="mx-auto w-[500px] -rotate-2"
                    src="/static/landing_chat.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div ref={scrollRef3} className="mt-16">
            <div className="gap-8 md:grid md:grid-cols-8">
              <div className="flex flex-col justify-center self-center text-left md:col-span-4 md:pr-8">
                <div className="mt-2 flex-initial">
                  <div className="font-objektiv text-xl font-bold tracking-tighter text-blue-500 md:text-2xl">
                    Build your own <br />
                    <span className="text-3xl text-sky-300 md:text-5xl">
                      powerful workflows
                    </span>
                    .
                  </div>
                  <p className="font-regular text-md mt-4 font-objektiv text-slate-300 md:text-lg">
                    Build custom Large Language Model apps on top of your
                    company data. Let Dust assist you with the details of
                    working with LLMs as you adapt them to your specific needs.
                  </p>
                  <div className="mt-6">
                    <Link href="https://docs.dust.tt">
                      <Button
                        variant="tertiary"
                        size="sm"
                        label="View Documentation"
                      />
                    </Link>
                  </div>
                </div>
                <div className="flex flex-1"></div>
              </div>
              <div className="mt-8 md:col-span-4 md:mt-0">
                <div className="mx-auto">
                  <img
                    className="mx-auto w-[500px] rotate-2"
                    src="/static/landing_block.png"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="h-32"></div>

          <div className="grid grid-cols-1">
            <p className="font-objektiv text-3xl font-bold text-red-400">
              Our product
              <br />
              <span className="text-3xl text-rose-300 md:text-5xl">
                constitution
              </span>
            </p>
          </div>

          <div className="h-6"></div>

          <div className="grid gap-4 text-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-semibold text-slate-100">
                Augmenting humans, not&nbsp;replacing&nbsp;them
              </p>
              <div className="h-2"></div>
              <p className="font-regular text-slate-500">
                We're optimistic about making work life better for smart people.
                We're building R2-D2, not Skynet.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100">
                Uncompromising on data security & privacy
              </p>
              <div className="h-2"></div>
              <p className="font-regular text-slate-500">
                We aspire to define standards rather than simply abide by
                the&nbsp;existing ones.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100">
                Hard problems over hype
              </p>
              <div className="h-2"></div>
              <p className="font-regular text-slate-500">
                There's more to do than wrapping GPT into a chat UI. We're in
                this to solve hard problems on user experience and product
                quality.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100">
                Building with an&nbsp;AI&nbsp;core
              </p>
              <div className="h-2"></div>
              <p className="font-regular text-slate-500">
                We're building with large language models in mind from the
                ground up, rather than sprinkling them here and&nbsp;there.
              </p>
            </div>
          </div>

          <div className="h-32"></div>
        </div>

        <div className="mx-auto my-10 mt-32 max-w-3xl pb-8 text-center font-objektiv font-objektiv text-sm text-slate-500">
          Dust © 2022-2023 –{" "}
          <Link href="https://dust-tt.notion.site/Legal-Notice-58b453f74d634ef7bb807d29a59b3db1">
            Legal
          </Link>
          {" - "}
          <Link href="/website-privacy">Website Privacy</Link>
          {" - "}
          <Link href="/platform-privacy">Platform Privacy</Link>
          {" - "}
          <Link href="/terms">Terms</Link>
          {" - "}
          <Link href="https://dust-tt.notion.site/Cookie-Policy-ec63a7fb72104a7babff1bf413e2c1ec">
            Cookies
          </Link>
        </div>
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

const HeadComponent = () => {
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
