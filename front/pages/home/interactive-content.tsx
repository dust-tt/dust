import { Button } from "@dust-tt/sparkle";
import Head from "next/head";
import type { ReactElement, ReactNode } from "react";

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

interface GettingStartedStep {
  number: string;
  title: string;
  description: string;
  image: {
    src: string;
    alt: string;
  };
  cta?: {
    label: string;
    href: string;
  };
}

const GETTING_STARTED_STEPS: GettingStartedStep[] = [
  {
    number: "1.",
    title: "Choose template",
    description:
      "Select from our library of interactive templates or start from scratch with our drag-and-drop builder.",
    image: {
      src: "/static/landing/interactive_content/Step1.png",
      alt: "Template gallery interface",
    },
    cta: {
      label: "Browse Templates",
      href: "/templates",
    },
  },
  {
    number: "2.",
    title: "Customize & build",
    description:
      "Add your content, branding, and interactive elements. Preview changes in real-time as you build.",
    image: {
      src: "/static/landing/interactive_content/Step2.png",
      alt: "Content editor interface with drag-and-drop elements",
    },
  },
  {
    number: "3.",
    title: "Publish & share",
    description:
      "Deploy your interactive content with one click. Share via link, embed on websites, or integrate with your tools.",
    image: {
      src: "/static/landing/interactive_content/Step3.png",
      alt: "Publishing interface with sharing options",
    },
  },
];

const DEMO_VIDEO = {
  sectionTitle: "Interactive content in motion",
  videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
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
            Create with Dust interactive content
          </H1>
          <P
            size="lg"
            className="pb-6 text-muted-foreground md:max-w-lg md:pb-8"
          >
            Turn static content into dynamic experiences that adapt to your
            audience - right where you work.
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
                  src="/static/landing/interactive-content/Ext_Hero.svg"
                  alt="Interactive content builder interface showing drag-and-drop elements and real-time preview"
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

function InteractiveContentInAction() {
  return (
    <div className={SECTION_CLASSES}>
      <div className={CONTAINER_CLASSES}>
        <div className="mb-12">
          <H2>Interactive content in action</H2>
        </div>

        <div className="space-y-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="order-1 flex items-center justify-center lg:order-1">
              <div className="w-full">
                <div className="relative w-full overflow-hidden rounded-lg bg-blue-50">
                  <img
                    src="/static/landing/interactive-content/SalesROI.svg"
                    alt="Interactive data visualizations for client presentations"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            </div>
            <div className="order-2 flex flex-col justify-center lg:order-2">
              <H3 className="mb-6">Sales team</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tr-full bg-red-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Interactive data visualizations for client presentations
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
                  <div className="h-6 w-6 flex-shrink-0 rounded-tl-full bg-blue-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      ROI calculators (simple math-based React components)
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-green-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Charts for quarterly business reviews
                    </P>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 flex flex-col justify-center lg:order-1">
              <H3 className="mb-6">Marketing team</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 bg-pink-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Campaign performance charts from data files
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-red-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      A/B testing results visualization
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tl-full bg-blue-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Interactive infographics (static data only)
                    </P>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 flex items-center justify-center lg:order-2">
              <div className="w-full">
                <div className="relative w-full overflow-hidden rounded-lg bg-pink-50">
                  <img
                    src="/static/landing/interactive-content/MarketingCampaign.svg"
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
                    src="/static/landing/interactive-content/UserEngagement.svg"
                    alt="Usage analytics and health score dashboards"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            </div>
            <div className="order-2 flex flex-col justify-center lg:order-2">
              <H3 className="mb-6">Customer success team</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-pink-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Usage analytics visualizations from exported data
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 bg-red-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Health score dashboards (file-based data)
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tr-full bg-yellow-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Interactive onboarding progress tracking
                    </P>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 flex flex-col justify-center lg:order-1">
              <H3 className="mb-6">Product & data teams</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 bg-purple-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Feature adoption charts from analytics exports
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-orange-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      User feedback sentiment analysis visualizations
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tl-full bg-teal-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Interactive data exploration of uploaded datasets
                    </P>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 flex items-center justify-center lg:order-2">
              <div className="w-full">
                <div className="relative w-full overflow-hidden rounded-lg bg-purple-50">
                  <img
                    src="/static/landing/interactive-content/ProductTeam.svg"
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
                  src="/static/landing/interactive-content/Security-share.svg"
                  alt="Security and sharing interface showing access controls and sharing options"
                  className="h-auto w-full object-contain"
                />
              </div>
            </div>
          </div>

          <div className="order-2 flex flex-col justify-center lg:order-2">
            <H3 className="mb-6">Secure and collaborative</H3>
            <P size="lg" className="text-muted-foreground">
              Share interactive content with conversation participants,
              workspace members, or anyone via public links
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
          <H2 className="mb-8 text-blue-600">Just use dust</H2>
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

export default function InteractiveContent() {
  return (
    <>
      <Head>
        <title>Dust - Interactive Content</title>
        <meta
          name="description"
          content="Create interactive content that converts. Transform static presentations, demos, and documents into engaging interactive experiences."
        />
        <meta property="og:title" content="Dust - Interactive Content" />
        <meta
          property="og:description"
          content="Create interactive content that converts. Transform static presentations, demos, and documents into engaging interactive experiences."
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://dust.tt/static/landing/hero_dust.png"
        />
        <meta
          property="og:url"
          content="https://dust.tt/home/interactive-content"
        />
      </Head>

      <div className="container flex w-full flex-col gap-16 px-2 py-2">
        <HeroSection />
        <InteractiveContentInAction />
        <SharingAndAccessSection />
        <VideoSection />
        <TrustedBy logoSet="landing" />
        <JustUseDustSection />
      </div>
    </>
  );
}

InteractiveContent.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
