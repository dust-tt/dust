import {
  Grid,
  H1,
  H2,
  H3,
  H4,
  P,
} from "@app/components/home/ContentComponents";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";
import { classNames } from "@app/lib/utils";
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

const SECTION_CLASSES = "py-12 md:py-16";
const CONTAINER_CLASSES = "container mx-auto px-6";
const GRID_SECTION_CLASSES = classNames(
  "flex flex-col gap-16",
  "col-span-12",
  "lg:col-span-12 lg:col-start-1",
  "xl:col-span-12 xl:col-start-1",
  "2xl:col-start-1"
);

interface ExtensionTab {
  label: string;
  heading: string;
  image: {
    src: string;
    alt: string;
  };
  features: {
    title: string;
    description: string;
    dotCSS: string;
    shape: "circle" | "square" | "rectangle" | "triangle" | "hexagon";
  }[];
}

const EXTENSION_TABS: ExtensionTab[] = [
  {
    label: "Sales",
    heading: "Close faster, from any tab.",
    image: {
      src: "/static/landing/chrome_ext/Ext_Sales.png",
      alt: "Sales teams using Dust Chrome Extension",
    },
    features: [
      {
        title: "Instant follow-ups from any call",
        description:
          "Paste a Gong transcript, get a personalized follow-up email without switching tools.",
        dotCSS: "text-pink-400",
        shape: "circle",
      },
      {
        title: "Outreach that feels human",
        description:
          "Pull context from your CRM and craft tailored messages right where you're prospecting.",
        dotCSS: "text-red-500",
        shape: "rectangle",
      },
      {
        title: "Your knowledge, everywhere you browse",
        description:
          "Access playbooks, battlecards, and customer data while you're live on a prospect's website.",
        dotCSS: "text-yellow-400",
        shape: "triangle",
      },
    ],
  },
  {
    label: "Engineering",
    heading: "Build faster, from any tab.",
    image: {
      src: "/static/landing/chrome_ext/Ext_Engineer.png",
      alt: "Engineering teams using Dust Chrome Extension",
    },
    features: [
      {
        title: "Code reviews, where you code",
        description:
          "Leverage review assistants directly from PRs without leaving your browser.",
        dotCSS: "text-pink-400",
        shape: "rectangle",
      },
      {
        title: "Suggestions while you browse docs",
        description:
          "Get intelligent suggestions while browsing documentation.",
        dotCSS: "text-red-500",
        shape: "circle",
      },
      {
        title: "Better PR comments, faster",
        description:
          "Share better PR comments on the go using company knowledge.",
        dotCSS: "text-yellow-500",
        shape: "triangle",
      },
    ],
  },
  {
    label: "Customer Support",
    heading: "Resolve faster, from any tab.",
    image: {
      src: "/static/landing/chrome_ext/Ext_CSupport.png",
      alt: "Support teams using Dust Chrome Extension",
    },
    features: [
      {
        title: "Respond from any web tool",
        description:
          "Reply to customer tickets from any web-based solution without switching apps.",
        dotCSS: "text-pink-400",
        shape: "square",
      },
      {
        title: "AI-assisted analysis",
        description:
          "Analyze dashboards with AI assistance right where you need it.",
        dotCSS: "text-red-500",
        shape: "rectangle",
      },
      {
        title: "Knowledge at your fingertips",
        description:
          "Get instant access to knowledge base without switching apps.",
        dotCSS: "text-blue-500",
        shape: "circle",
      },
    ],
  },
];

interface InstallationStep {
  number: string;
  title: string;
  description: string;
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

const CHROME_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/dust/fnkfcndbgingjcbdhaofkcnhcjpljhdn";

const CHROME_EXTENSION_VIDEO_URL =
  "https://fast.wistia.net/embed/iframe/ivk2mh7it7";

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

function WebAppSidebarSection() {
  return (
    <Grid>
      <div className={GRID_SECTION_CLASSES}>
        <H2 className="text-center">
          Everything the web app can do in your{" "}
          <span className="text-brand-electric-blue">sidebar</span>
        </H2>
        <DemoVideoSection
          demoVideo={{
            videoUrl: CHROME_EXTENSION_VIDEO_URL,
            showCaptions: true,
          }}
        />
      </div>
    </Grid>
  );
}

function ChromeExtensionInActionFor() {
  return (
    <div className={SECTION_CLASSES}>
      <div className={CONTAINER_CLASSES}>
        <H2 className="mb-8 text-center">Chrome extension in action for</H2>

        <Tabs defaultValue={EXTENSION_TABS[0].label}>
          <TabsList border>
            {EXTENSION_TABS.map((t) => (
              <TabsTrigger key={t.label} value={t.label} label={t.label} />
            ))}
          </TabsList>

          {EXTENSION_TABS.map((t) => (
            <TabsContent key={t.label} value={t.label}>
              {/* Content: image left, features right */}
              <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:gap-16">
                <div className="flex-1">
                  <div className="relative w-full overflow-hidden rounded-2xl bg-blue-50">
                    <img
                      src={t.image.src}
                      alt={t.image.alt}
                      className="h-auto w-full object-contain"
                    />
                  </div>
                </div>
                <div className="flex flex-1 flex-col justify-center">
                  <H3 className="mb-6">{t.heading}</H3>
                  <div className="flex flex-col gap-6">
                    {t.features.map((f, i) => (
                      <div key={i}>
                        <P
                          size="sm"
                          dotCSS={f.dotCSS}
                          shape={f.shape}
                          className="text-foreground"
                        >
                          <strong className="font-semibold">{f.title}</strong>
                          <br />
                          <span className="text-muted-foreground">
                            {f.description}
                          </span>
                        </P>
                        {i < t.features.length - 1 && (
                          <hr className="mt-6 border-gray-200" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function InstallationSection() {
  return (
    <div className="py-16 md:py-20">
      <div className={CONTAINER_CLASSES}>
        <H2 className="mb-12 text-center">How to install</H2>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          {INSTALLATION_STEPS.map((step, index) => (
            <div key={index} className="flex w-full flex-col gap-4">
              <div className="w-full overflow-hidden rounded-2xl">
                <img
                  src={step.image.src}
                  alt={step.image.alt}
                  className="h-auto w-full object-contain"
                />
              </div>
              <div>
                <H4 className="mb-2 text-left font-semibold">
                  {step.number} {step.title}
                </H4>
                <P size="sm" className="text-left text-muted-foreground">
                  {step.description}
                </P>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            variant="primary"
            size="md"
            label="Install Chrome Extension"
            icon={() => (
              <img src="/static/landing/chrome_ext/Chrome.svg" alt="Chrome" />
            )}
            href={CHROME_EXTENSION_URL}
            target="_blank"
          />
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

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
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
        <WebAppSidebarSection />
        <ChromeExtensionInActionFor />
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
