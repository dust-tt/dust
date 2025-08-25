import Head from "next/head";
import type { ReactElement } from "react";

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
import UTMButton from "@app/components/UTMButton";
import UTMPageWrapper from "@app/components/UTMPageWrapper";
import { classNames } from "@app/lib/utils";

// Constants
const SECTION_CLASSES = "py-12 md:py-16";
const CONTAINER_CLASSES = "container mx-auto px-6";

// Types
interface SupportOption {
  icon: string;
  title: string;
  description: string;
  button?: {
    label: string;
    href: string;
  };
  color: string;
}

interface DocumentationResource {
  title: string;
  description: string;
  button: {
    label: string;
    href: string;
  };
}

// Data
const SUPPORT_OPTIONS: SupportOption[] = [
  {
    icon: "/static/landing/industry/d-blue.svg",
    title: "Already have an account?",
    description:
      "Ask the @help agent for instant answers to basic questions about using Dust.",
    color: "blue",
  },
  {
    icon: "/static/landing/industry/d-red.svg",
    title: "Email Support",
    description:
      "We respond to all requests within 2 business days. No signup required.",
    button: {
      label: "Contact support",
      href: "mailto:support@dust.tt",
    },
    color: "red",
  },
  {
    icon: "/static/landing/industry/d-green.svg",
    title: "Community",
    description: "Connect with other Dust users and get help from our team.",
    button: {
      label: "Join community",
      href: "https://community.dust.tt",
    },
    color: "green",
  },
];

const DOCUMENTATION_RESOURCES: DocumentationResource[] = [
  {
    title: "User Documentation",
    description: "All you need to create and use your first AI agents.",
    button: {
      label: "Visit documentation",
      href: "https://docs.dust.tt",
    },
  },
  {
    title: "Use Cases & Guides",
    description:
      "See how you can leverage the power of AI to your specific needs.",
    button: {
      label: "Explore solutions",
      href: "/home/",
    },
  },
  {
    title: "Developer Platform",
    description: "API Reference and technical documentation.",
    button: {
      label: "Access platform",
      href: "https://docs.dust.tt/developers",
    },
  },
];

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

// Components
function HeroSection() {
  return (
    <div className="container flex w-full flex-col px-6 pt-8 md:px-4 md:pt-24">
      <Grid className="gap-x-4 lg:gap-x-8">
        <div className="col-span-12 flex flex-col justify-center py-4 text-left lg:col-span-6 lg:col-start-1">
          <H1
            mono
            className="mb-4 text-3xl font-medium leading-tight md:text-4xl lg:text-5xl xl:text-6xl"
          >
            Need help with <br />
            Dust?
          </H1>
          <P
            size="lg"
            className="pb-6 text-muted-foreground md:max-w-lg md:pb-8"
          >
            We're here to help you get the most out of your AI agents and the
            Dust platform.
          </P>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <UTMButton
              variant="primary"
              size="md"
              label="Contact support"
              href="mailto:support@dust.tt"
              className="w-full sm:w-auto"
            />
            <UTMButton
              variant="outline"
              size="md"
              label="Visit our documentation"
              href="https://docs.dust.tt"
              className="w-full sm:w-auto"
            />
          </div>
        </div>

        <div className="relative col-span-12 mt-8 py-2 lg:col-span-6 lg:col-start-7 lg:mt-0">
          <div className="flex h-full w-full items-center justify-center">
            <div className="relative w-full max-w-xl xl:max-w-2xl">
              <div className="relative z-10 mx-auto flex w-full items-center justify-center">
                <img
                  src="/static/landing/support/Dust_Question.png"
                  alt="Dust support illustration showing question interface"
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

function SupportOptionsSection() {
  return (
    <div className={SECTION_CLASSES}>
      <div className={CONTAINER_CLASSES}>
        <div className="grid gap-6 sm:gap-8 md:grid-cols-3">
          {SUPPORT_OPTIONS.map((option, index) => (
            <div key={index} className="rounded-2xl bg-gray-50 p-8">
              <div className="mb-6 flex h-12 w-12 items-center justify-center">
                <img
                  src={option.icon}
                  alt={`${option.color} geometric shape icon`}
                  className="h-full w-full object-contain"
                />
              </div>
              <H3 className="mb-4">{option.title}</H3>
              <P size="sm" className="mb-6 text-muted-foreground">
                {option.description}
              </P>
              {option.button && (
                <UTMButton
                  variant="outline"
                  size="sm"
                  label={option.button.label}
                  href={option.button.href}
                  className="w-full sm:w-auto"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DocumentationSection() {
  return (
    <div className={SECTION_CLASSES}>
      <div className={CONTAINER_CLASSES}>
        <div className="mb-12 text-center">
          <H2 className="mb-4">Documentation</H2>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {DOCUMENTATION_RESOURCES.map((resource, index) => (
            <div
              key={index}
              className="flex flex-col rounded-lg border border-gray-100 p-6 text-left"
            >
              <H4 className="mb-4">{resource.title}</H4>
              <P size="sm" className="mb-6 flex-grow text-muted-foreground">
                {resource.description}
              </P>
              <UTMButton
                variant="outline"
                size="sm"
                label={resource.button.label}
                href={resource.button.href}
                className="w-full sm:w-auto"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CommitmentSection() {
  return (
    <div className="py-12">
      <div className={classNames(CONTAINER_CLASSES, "text-center")}>
        <P className="text-muted-foreground">
          We're committed to responsive support and will get back to you within
          2 business days.
        </P>
      </div>
    </div>
  );
}

function JustUseDustSection() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-blue-50 py-16 md:py-20">
      {/* Decorative shapes */}
      <div className="absolute left-0 top-0 h-48 w-48 -translate-x-1/3 -translate-y-1/3 rounded-full bg-pink-300" />
      <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/3 translate-x-1/3 rotate-45 bg-blue-400" />
      <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-1/3 translate-y-1/3 rounded-full bg-green-400" />
      <div className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/3 translate-y-1/3 bg-red-400" />

      <div className={CONTAINER_CLASSES}>
        <div className="relative flex flex-col items-center justify-center py-12 text-center md:py-16">
          <H2 className="mb-8 text-4xl text-blue-600 sm:text-5xl md:text-6xl">
            Just use Dust
          </H2>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <UTMButton
              variant="highlight"
              size="md"
              label="Start Free Trial"
              href="/pricing"
              className="w-full sm:w-auto"
            />
            <UTMButton
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

export default function Support() {
  return (
    <UTMPageWrapper>
      <Head>
        <title>Dust - Support & Help</title>
        <meta
          name="description"
          content="Get help with Dust AI platform. Access documentation, contact support, and connect with our community."
        />
        <meta property="og:title" content="Dust - Support & Help" />
        <meta
          property="og:description"
          content="Get help with Dust AI platform. Access documentation, contact support, and connect with our community."
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://dust.tt/static/landing/hero_dust.png"
        />
        <meta property="og:url" content="https://dust.tt/home/support" />
      </Head>

      <div className="container flex w-full flex-col gap-4 px-2 py-2">
        <HeroSection />
        <SupportOptionsSection />
        <DocumentationSection />
        <CommitmentSection />
        <TrustedBy logoSet="landing" />
        <JustUseDustSection />
      </div>
    </UTMPageWrapper>
  );
}

Support.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
