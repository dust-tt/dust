import { Button } from "@dust-tt/sparkle";
import Head from "next/head";
import type { ReactElement } from "react";

import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import {
  Grid,
  H1,
  H2,
  H3,
  H4,
  P,
} from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import TrustedBy from "@app/components/home/TrustedBy";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

// Installation Section Component
const InstallationSection = () => (
  <div className="py-16 md:py-20">
    <div className="container mx-auto px-6">
      <div className="mb-12">
        <H2 className="text-left text-3xl font-bold md:text-4xl lg:text-5xl">
          Installation
        </H2>
      </div>

      <div className="flex items-start gap-6 overflow-x-auto">
        {/* Step 1 */}
        <div className="flex min-w-80 flex-1 flex-col gap-4">
          <div className="h-24">
            <H4 className="mb-4 text-left text-lg font-semibold text-blue-600">
              1. Access Your Dust Workspace
            </H4>
            <P size="sm" className="text-left text-gray-700">
              Go to your Dust workspace settings and enable the Slack
              integration.
            </P>
          </div>
          <div className="h-48">
            <img
              src="/static/landing/slack/Login.png"
              alt="Dust login interface"
              className="h-full w-80 rounded-lg border object-contain"
            />
          </div>
          <div className="h-12">
            <Button
              variant="primary"
              size="md"
              label="Login to Dust"
              href="/api/auth/login"
              className="w-full sm:w-auto"
            />
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex min-w-80 flex-1 flex-col gap-4">
          <div className="h-24">
            <H4 className="mb-4 text-left text-lg font-semibold text-blue-600">
              2. Connect to Slack
            </H4>
            <P size="sm" className="text-left text-gray-700">
              Click the toggle to connect your Slack workspace to Dust.
            </P>
          </div>
          <div className="h-48">
            <img
              src="/static/landing/slack/WSettings.png"
              alt="Workspace settings interface"
              className="h-full w-80 rounded-lg border object-contain"
            />
          </div>
          <div className="h-12"></div>
        </div>

        {/* Step 3 */}
        <div className="flex min-w-80 flex-1 flex-col gap-4">
          <div className="h-24">
            <H4 className="mb-4 text-left text-lg font-semibold text-blue-600">
              3. Start Using
            </H4>
            <P size="sm" className="text-left text-gray-700">
              Mention <span className="font-medium text-blue-600">@dust</span>{" "}
              in any Slack channel or send a direct message to get started.
            </P>
          </div>
          <div className="h-48">
            <img
              src="/static/landing/slack/Slack.png"
              alt="Slack interface with Dust integration"
              className="h-full w-80 rounded-lg border object-contain"
            />
          </div>
          <div className="h-12"></div>
        </div>
      </div>
    </div>
  </div>
);

// Important Notice Section
const ImportantNoticeSection = () => (
  <div className="py-16">
    <div className="container mx-auto px-6">
      <div className="text-left">
        <H2 className="mb-4 text-2xl font-semibold">Important notice</H2>
        <P className="text-left text-muted-foreground">
          This app uses AI and may generate inaccurate content. Verify important
          information before acting.
        </P>
      </div>
    </div>
  </div>
);

// Just Use Dust Section
const JustUseDustSection = () => (
  <div className="relative overflow-hidden rounded-xl bg-blue-50 py-16 md:py-20">
    {/* Decorative shapes */}
    <div className="absolute left-0 top-0 h-48 w-48 -translate-x-1/3 -translate-y-1/3 rounded-full bg-pink-300" />
    <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/3 translate-x-1/3 rotate-45 bg-blue-400" />
    <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-1/3 translate-y-1/3 rounded-full bg-green-400" />
    <div className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/3 translate-y-1/3 bg-red-400" />

    <div className="container mx-auto px-6">
      <div className="relative flex flex-col items-center justify-center py-12 text-center md:py-16">
        <H2 className="mb-8 text-4xl text-blue-600 sm:text-5xl md:text-6xl">
          Just use Dust
        </H2>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Button
            variant="highlight"
            size="md"
            label="Start Free Trial"
            href="/api/auth/login"
            className="w-full sm:w-auto"
          />
          <Button
            variant="outline"
            size="md"
            label="Contact Sales"
            href="/home/contact"
            className="w-full sm:w-auto"
          />
        </div>
      </div>
    </div>
  </div>
);

// Hero Section Component
const HeroSection = () => (
  <div className="container flex w-full flex-col px-6 pt-8 md:px-4 md:pt-24">
    <Grid className="gap-x-4 lg:gap-x-8">
      <div className="col-span-12 flex flex-col justify-center py-4 text-left lg:col-span-6 lg:col-start-1">
        <div className="mb-4"></div>
        <H1
          mono
          className="mb-4 text-4xl font-medium leading-tight md:text-5xl lg:text-6xl xl:text-7xl"
        >
          Dust app for <br></br>Slack
        </H1>
        <P size="lg" className="pb-6 text-muted-foreground md:max-w-lg md:pb-8">
          Transform your Slack workspace into an AI-powered knowledge hub.
        </P>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Button
            variant="primary"
            size="md"
            label="Get started"
            href="/pricing"
            className="w-full sm:w-auto"
          />
          <Button
            variant="outline"
            size="md"
            label="Contact sales"
            href="/home/contact"
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      <div className="relative col-span-12 mt-8 py-2 lg:col-span-6 lg:col-start-7 lg:mt-0">
        <div className="flex h-full w-full items-center justify-center">
          <div className="relative w-full max-w-xl xl:max-w-2xl">
            <div className="relative z-10 mx-auto flex w-full items-center justify-center">
              <img
                src="/static/landing/slack/Incident_copilot_slack.png"
                alt="Slack integration preview"
                className="h-auto w-full max-w-lg rounded-2xl object-contain lg:max-w-xl xl:max-w-2xl"
              />
            </div>
          </div>
        </div>
      </div>
    </Grid>
  </div>
);

// Pain Points Section
const PainPointsSection = () => {
  const painPoints = [
    {
      icon: "/static/landing/industry/d-blue.svg",
      title: "Your company knowledge, instantly in Slack",
      description:
        "AI agents surface relevant information from across your organization directly in conversations.",
      color: "blue",
    },
    {
      icon: "/static/landing/industry/d-red.svg",
      title: "Turn conversations into action",
      description:
        "AI agents retrieve data and execute tasks across your tools, keeping work flowing seamlessly. ",
      color: "red",
    },
    {
      icon: "/static/landing/industry/d-green.svg",
      title: "Smart automation that works for you",
      description:
        "Connect Dust agents to Slack workflows for automated responses and proactive task management.",
      color: "green",
    },
  ];

  return (
    <div className="py-12 md:py-16">
      <div className="container mx-auto px-6">
        <div className="grid gap-6 sm:gap-8 md:grid-cols-3">
          {painPoints.map((point, index) => (
            <div key={index} className="rounded-2xl bg-gray-50 p-8">
              <div className="mb-6 flex h-12 w-12 items-center justify-center">
                <img
                  src={point.icon}
                  alt={`${point.color} geometric shape`}
                  className="h-full w-full object-contain"
                />
              </div>
              <H3 className="mb-4">{point.title}</H3>
              <P size="sm" className="text-muted-foreground">
                {point.description}
              </P>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Demo Video Section
const VideoSection = () => {
  const demoVideo = {
    sectionTitle: "How it works in Slack",
    videoUrl: "https://fast.wistia.net/embed/iframe/wlvjl8lphk",
    showCaptions: true,
  };

  return (
    <Grid>
      <div className="col-span-12 flex flex-col gap-16 lg:col-span-12 lg:col-start-1 xl:col-span-12 xl:col-start-1 2xl:col-start-1">
        <DemoVideoSection demoVideo={demoVideo} />
      </div>
    </Grid>
  );
};

export default function SlackIntegration() {
  return (
    <>
      <Head>
        <title>Dust - Slack Integration</title>
        <meta
          name="description"
          content="Transform your Slack workspace into an AI-powered knowledge hub with the Dust app for Slack."
        />
        <meta property="og:title" content="Dust - Slack Integration" />
        <meta
          property="og:description"
          content="Transform your Slack workspace into an AI-powered knowledge hub with the Dust app for Slack."
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://dust.tt/static/landing/hero_dust.png"
        />
        <meta
          property="og:url"
          content="https://dust.tt/home/slack/slack-integration"
        />
      </Head>

      <div className="container flex w-full flex-col gap-4 px-2 py-2">
        <HeroSection />
        <PainPointsSection />
        <VideoSection />
        <InstallationSection />
        <ImportantNoticeSection />
        <TrustedBy logoSet="landing" />
        <JustUseDustSection />
      </div>
    </>
  );
}

SlackIntegration.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
