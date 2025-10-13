import {
  Button,
  CheckCircleIcon,
  Icon,
  LockIcon,
  PlanetIcon,
} from "@dust-tt/sparkle";
import Head from "next/head";
import type { ReactElement } from "react";

import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { Grid, H1, H2, H3, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import TrustedBy from "@app/components/home/TrustedBy";
import { classNames } from "@app/lib/utils";

const SECTION_CLASSES = "py-12 md:py-16";
const CONTAINER_CLASSES = "container mx-auto px-6";
const GRID_SECTION_CLASSES = classNames(
  "flex flex-col gap-16",
  "col-span-12",
  "lg:col-span-12 lg:col-start-1",
  "xl:col-span-12 xl:col-start-1",
  "2xl:col-start-1"
);

const DEMO_VIDEO = {
  sectionTitle: "See how it works",
  // TODO: Replace video URL with Marketing one.
  videoUrl: "https://youtu.be/qM5JXmTwc80",
  showCaptions: true,
};

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

function HeroSection() {
  return (
    <div className="container flex w-full flex-col px-6 pt-8 md:px-4 md:pt-16">
      <Grid className="items-center gap-x-4 lg:gap-x-8">
        <div className="col-span-12 flex flex-col justify-center py-4 text-left lg:col-span-6 lg:col-start-1">
          <H1
            mono
            className="mb-4 text-4xl font-medium leading-tight md:text-5xl lg:text-6xl xl:text-7xl"
          >
            Create interactive content with <span>Frames</span>
          </H1>
          <P
            size="lg"
            className="pb-6 text-muted-foreground md:max-w-lg md:pb-8"
          >
            Turn static outputs from your Dust AI agents into collaborative,
            editable visuals, tailored to whoever you're sharing them with.
          </P>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Button
              variant="primary"
              size="md"
              label="Get started"
              href="/signup"
              className="w-full sm:w-auto"
            />
            <Button
              variant="outline"
              size="md"
              label="Get a demo"
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
                  src="/static/landing/frames/Ext_Hero.svg"
                  alt="Content builder interface showing drag-and-drop elements and real-time preview"
                  className="h-auto w-full max-w-lg rounded-2xl object-contain lg:max-w-xl xl:max-w-2xl"
                />
              </div>
            </div>
          </div>
        </div>
      </Grid>
    </div>
  );
}

function ContentInAction() {
  return (
    <div className={SECTION_CLASSES}>
      <div className={CONTAINER_CLASSES}>
        <div className="mb-12">
          <H2>Frames in action</H2>
          <P size="lg" className="mt-4 text-muted-foreground">
            AI agents shouldn't hand you static charts you paste into a slide
            and forget about. They should hand you something you can poke, edit,
            and tailor on the spot.
          </P>
        </div>

        <div className="space-y-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="order-1 flex items-center justify-center lg:order-1">
              <div className="w-full">
                <div className="relative w-full overflow-hidden rounded-lg bg-blue-50">
                  <img
                    src="/static/landing/frames/SalesROI.svg"
                    alt="Data visualizations for client presentations"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            </div>
            <div className="order-2 flex flex-col justify-center lg:order-2">
              <H3 className="mb-6">Sales</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tr-full bg-red-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Pull in a CSV and watch it turn into a chart your customer
                      can click through during sales calls
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-bl-full bg-yellow-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Performance dashboards from uploaded CSV/data files
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-green-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Make quarterly business reviews with charts that feel like
                      a conversation
                    </P>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 flex flex-col justify-center lg:order-1">
              <H3 className="mb-6">Marketing</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 bg-pink-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Drop in campaign exports and generate a dashboard you can
                      slice by channel and cohort
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-red-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Upload A/B results and get a readout with lift and
                      significance you can explore
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tl-full bg-blue-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Turn results into an editable infographic you can tailor
                      for exec reviews and posts
                    </P>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 flex items-center justify-center lg:order-2">
              <div className="w-full">
                <div className="relative w-full overflow-hidden rounded-lg bg-pink-50">
                  <img
                    src="/static/landing/frames/MarketingCampaign.svg"
                    alt="Campaign performance charts and A/B testing results"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="order-1 flex items-center justify-center lg:order-1">
              <div className="w-full">
                <div className="relative w-full overflow-hidden rounded-lg bg-green-50">
                  <img
                    src="/static/landing/frames/UserEngagement.svg"
                    alt="Usage analytics and health score dashboards"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            </div>
            <div className="order-2 flex flex-col justify-center lg:order-2">
              <H3 className="mb-6">Customer Success</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-pink-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Import usage exports and get a health dashboard your
                      customer can filter in QBRs
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 bg-red-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Spin up an onboarding tracker both teams update so dates
                      and owners stay clear
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tr-full bg-yellow-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Create a renewal summary that pulls wins and gaps into one
                      live page
                    </P>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 flex flex-col justify-center lg:order-1">
              <H3 className="mb-6">Product & Data</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 bg-purple-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Upload analytics and explore feature adoption
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-orange-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Combine NPS, tickets, and notes into a trends view with
                      example quotes you can drill into
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tl-full bg-teal-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Build a retention dashboard with cohort curves you can
                      compare side by side
                    </P>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 flex items-center justify-center lg:order-2">
              <div className="w-full">
                <div className="relative w-full overflow-hidden rounded-lg bg-purple-50">
                  <img
                    src="/static/landing/frames/ProductTeam.svg"
                    alt="Feature adoption charts and data exploration tools"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoSection() {
  return (
    <Grid>
      <div className={GRID_SECTION_CLASSES}>
        <DemoVideoSection demoVideo={DEMO_VIDEO} />
      </div>
    </Grid>
  );
}

function AllTheBellsAndWhistlesSection() {
  return (
    <div className={SECTION_CLASSES}>
      <div className={CONTAINER_CLASSES}>
        <div className="mb-12">
          <H2>All the bells and whistles</H2>
        </div>

        <div className="flex w-full flex-col justify-between gap-6 md:flex-row">
          <div className="flex flex-1 flex-col rounded-2xl bg-gray-50 p-6">
            <Icon visual={LockIcon} className="mb-4 h-8 w-8 text-gray-600" />
            <h4 className="text-lg font-semibold">
              Secure and collaborative by default
            </h4>
            <P size="sm" className="mt-1 text-muted-foreground">
              With share and control access, you can use Frames with your team,
              customers, or your boss and still sleep at night knowing you
              control who can touch what.
            </P>
          </div>
          <div className="flex flex-1 flex-col rounded-2xl bg-gray-50 p-6">
            <Icon visual={PlanetIcon} className="mb-4 h-8 w-8 text-gray-600" />
            <h4 className="text-lg font-semibold">Works anywhere</h4>
            <P size="sm" className="mt-1 text-muted-foreground">
              Works with whatever your AI agents produce: CSVs, JSON, plain
              text, or screenshots that need a glow-up.
            </P>
          </div>
          <div className="flex flex-1 flex-col rounded-2xl bg-gray-50 p-6">
            <Icon
              visual={CheckCircleIcon}
              className="mb-4 h-8 w-8 text-gray-600"
            />
            <h4 className="text-lg font-semibold">Wears your jersey</h4>
            <P size="sm" className="mt-1 text-muted-foreground">
              Your charts, dashboards, and pages don't look like they came from
              "some tool." They wear your logo, colors, and style, so every
              share feels like it's from you.
            </P>
          </div>
        </div>
      </div>
    </div>
  );
}

function SharingAndAccessSection() {
  return (
    <div className="py-16 md:py-20">
      <div className={CONTAINER_CLASSES}>
        <div className="mb-12">
          <H2>Share and control access</H2>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="order-1 flex items-center justify-center lg:order-1">
            <div className="w-full">
              <div className="relative w-full overflow-hidden rounded-lg bg-violet-100">
                <img
                  src="/static/landing/frames/Security-share.svg"
                  alt="Security and sharing interface showing access controls and sharing options"
                  className="h-auto w-full object-contain"
                />
              </div>
            </div>
          </div>

          <div className="order-2 flex flex-col justify-center lg:order-2">
            <H3 className="mb-6">Secure and collaborative</H3>
            <P size="lg" className="text-muted-foreground">
              Share content with workspace members, or anyone via public links
            </P>
          </div>
        </div>
      </div>
    </div>
  );
}

function JustUseDustSection() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-blue-50 py-16 md:py-20">
      <div className="absolute left-0 top-0 h-48 w-48 -translate-x-1/3 -translate-y-1/3 rounded-full bg-pink-300" />
      <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/3 translate-x-1/3 rotate-45 bg-blue-400" />
      <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-1/3 translate-y-1/3 rounded-full bg-green-400" />
      <div className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/3 translate-y-1/3 bg-red-400" />

      <div className={CONTAINER_CLASSES}>
        <div className="relative flex flex-col items-center justify-center py-12 text-center md:py-16">
          <H2 className="mb-8 text-blue-600">Just use Dust</H2>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Button
              variant="highlight"
              size="md"
              label="Start free trial"
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
      </div>
    </div>
  );
}

export default function Frames() {
  return (
    <>
      <Head>
        <title>Dust - Frames</title>
        <meta
          name="description"
          content="Create frames with Dust. Turn static outputs from your Dust AI agents into collaborative, editable visuals, tailored to whoever you're sharing them with."
        />
        <meta property="og:title" content="Dust - Frames" />
        <meta
          property="og:description"
          content="Create frames with Dust. Turn static outputs from your Dust AI agents into collaborative, editable visuals, tailored to whoever you're sharing them with."
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://dust.tt/static/landing/hero_dust.png"
        />
        <meta property="og:url" content="https://dust.tt/home/frames" />
      </Head>

      <div className="container flex w-full flex-col gap-16 px-2 py-2">
        <HeroSection />
        <ContentInAction />
        <AllTheBellsAndWhistlesSection />
        <SharingAndAccessSection />
        <VideoSection />
        <TrustedBy logoSet="landing" />
        <JustUseDustSection />
      </div>
    </>
  );
}

Frames.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
