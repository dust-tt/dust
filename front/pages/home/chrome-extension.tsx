import { Button } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
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
import { PageMetadata } from "@app/components/home/PageMetadata";
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

interface InstallationStep {
  number: string;
  title: string;
  description: string | ReactNode;
  image: {
    src: string;
    alt: string;
  };
}

const INSTALLATION_STEPS: InstallationStep[] = [
  {
    number: "1.",
    title: "Install",
    description: "Install the Dust Chrome Extension from the Chrome Web Store.",
    image: {
      src: "/static/landing/chrome_ext/Step1.png",
      alt: "Chrome Web Store installation",
    },
  },
  {
    number: "2.",
    title: "Configure",
    description: "Pin the Dust extension to keep it at your fingertips.",
    image: {
      src: "/static/landing/chrome_ext/Step2.png",
      alt: "Extension configuration interface",
    },
  },
  {
    number: "3.",
    title: "Start using",
    description:
      "Access Dust AI assistance directly from any web page with a simple click.",
    image: {
      src: "/static/landing/chrome_ext/Step3.png",
      alt: "Chrome extension in action",
    },
  },
];

const DEMO_VIDEO = {
  sectionTitle: "Chrome Extension in motion",
  videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  showCaptions: true,
};

const CHROME_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/dust/fnkfcndbgingjcbdhaofkcnhcjpljhdn";

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
            Bring Dust agents into your browser
          </H1>
          <P
            size="lg"
            className="pb-6 text-muted-foreground md:max-w-lg md:pb-8"
          >
            Access company knowledge and AI assistance without leaving your
            current tab.
          </P>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Button
              variant="primary"
              size="md"
              label="Install Chrome Extension"
              icon={() => (
                <img src="/static/landing/chrome_ext/Chrome.svg" alt="Chrome" />
              )}
              href={CHROME_EXTENSION_URL}
              target="_blank"
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
                  src="/static/landing/chrome_ext/Ext_Hero.png"
                  alt="Chrome extension preview showing Dust AI assistant in browser"
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

function ChromeExtensionInAction() {
  return (
    <div className={SECTION_CLASSES}>
      <div className={CONTAINER_CLASSES}>
        <div className="mb-12">
          <H2>Chrome extension in action</H2>
        </div>

        <div className="space-y-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="order-1 flex items-center justify-center lg:order-1">
              <div className="w-full">
                <div className="relative w-full overflow-hidden rounded-lg bg-blue-50">
                  <img
                    src="/static/landing/chrome_ext/Ext_Sales.png"
                    alt="Sales teams Features"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            </div>
            <div className="order-2 flex flex-col justify-center lg:order-2">
              <H3 className="mb-6">Sales teams</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tr-full bg-red-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Pull insights from multiple platforms to write custom
                      follow-ups.
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-bl-full bg-yellow-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Craft personalized outreach without leaving your CRM.
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tl-full bg-blue-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Access company knowledge while browsing prospect websites.
                    </P>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 flex flex-col justify-center lg:order-1">
              <H3 className="mb-6">Support teams</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 bg-pink-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Respond to customer tickets from any web-based solution.
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-red-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Analyze dashboards with AI assistance right where you need
                      it.
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tl-full bg-blue-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Get instant access to knowledge base without switching
                      apps.
                    </P>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 flex items-center justify-center lg:order-2">
              <div className="w-full">
                <div className="relative w-full overflow-hidden rounded-lg bg-pink-50">
                  <img
                    src="/static/landing/chrome_ext/Ext_CSupport.png"
                    alt="Support teams Features"
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
                    src="/static/landing/chrome_ext/Ext_Engineer.png"
                    alt="Engineering teams Features"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            </div>
            <div className="order-2 flex flex-col justify-center lg:order-2">
              <H3 className="mb-6">Engineering teams</H3>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-br-full bg-pink-400"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Leverage code review assistants directly from PRs.
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 bg-red-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Get intelligent suggestions while browsing documentation.
                    </P>
                  </div>
                </div>
                <hr className="border-gray-200" />
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 flex-shrink-0 rounded-tr-full bg-yellow-500"></div>
                  <div>
                    <P size="sm" className="font-medium">
                      Share better PR comments faster on the go.
                    </P>
                  </div>
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

function InstallationSection() {
  return (
    <div className="py-16 md:py-20">
      <div className={CONTAINER_CLASSES}>
        <div className="mb-12">
          <H2>Installation</H2>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          <div className="flex w-full flex-col gap-4">
            <div className="min-h-24">
              <H4 className="mb-4 text-left text-lg font-semibold text-blue-600">
                {INSTALLATION_STEPS[0].number} {INSTALLATION_STEPS[0].title}
              </H4>
              <P size="sm" className="text-left text-gray-700">
                {INSTALLATION_STEPS[0].description}
              </P>
            </div>
            <div className="min-h-48">
              <img
                src={INSTALLATION_STEPS[0].image.src}
                alt={INSTALLATION_STEPS[0].image.alt}
                className="h-full w-full rounded-lg border object-contain"
              />
            </div>
            <div className="flex min-h-12 items-center justify-start">
              <Button
                variant="primary"
                size="md"
                label="Install Chrome Extension"
                icon={() => (
                  <img
                    src="/static/landing/chrome_ext/Chrome.svg"
                    alt="Chrome"
                  />
                )}
                href={CHROME_EXTENSION_URL}
                target="_blank"
                className="w-full"
              />
            </div>
          </div>

          {INSTALLATION_STEPS.slice(1).map((step, index) => (
            <div key={index + 1} className="flex w-full flex-col gap-4">
              <div className="min-h-24">
                <H4 className="mb-4 text-left text-lg font-semibold text-blue-600">
                  {step.number} {step.title}
                </H4>
                <P size="sm" className="text-left text-gray-700">
                  {step.description}
                </P>
              </div>
              <div className="min-h-48">
                <img
                  src={step.image.src}
                  alt={step.image.alt}
                  className="h-full w-full rounded-lg border object-contain"
                />
              </div>
              <div className="min-h-12" />
            </div>
          ))}
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
              label="Start Free Trial"
              href="/pricing"
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
}

export default function ChromeExtension() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Dust Chrome Extension: AI Agents in Your Browser"
        description="Bring your Dust agents right into your browser. Access company knowledge and AI assistance without leaving your current tab."
        pathname={router.asPath}
        ogImage="https://dust.tt/static/landing/hero_dust.png"
      />

      <div className="container flex w-full flex-col gap-16 px-2 py-2">
        <HeroSection />
        <ChromeExtensionInAction />
        <VideoSection />
        <InstallationSection />
        <TrustedBy logoSet="landing" />
        <JustUseDustSection />
      </div>
    </>
  );
}

ChromeExtension.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
