import { EbookForm } from "@app/components/home/EbookForm";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import Image from "next/legacy/image";
import type { ReactElement } from "react";

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      hideNavigation: true,
    },
  };
}

const CUSTOMER_LOGOS = [
  { src: "/static/landing/logos/gray/clay.svg", alt: "Clay" },
  { src: "/static/landing/logos/gray/vanta.svg", alt: "Vanta" },
  { src: "/static/landing/logos/gray/persona.svg", alt: "Persona" },
  { src: "/static/landing/logos/gray/cursor.svg", alt: "Cursor" },
  { src: "/static/landing/logos/gray/blueground.svg", alt: "Blueground" },
];

const LEARNING_POINTS = [
  "How to build a practical AI strategy that connects to your existing workflows and tools.",
  "Where to start with enterprise AI adoption — and the most common pitfalls to avoid.",
  "A framework for measuring ROI and tracking the impact of AI agents across teams.",
  "Real examples from companies that have scaled AI agents from pilot to production.",
  "How to drive organizational change and get cross-functional buy-in for AI initiatives.",
];

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function EbookLandingPage() {
  return (
    <>
      <PageMetadata
        title="The Connected Enterprise AI Playbook | Dust"
        description="Download the free ebook based on insights from 100+ customers. Learn how to build, deploy, and scale AI agents across your organization."
        pathname="/landing/ebook"
      />

      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left column — Content */}
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-4">
              <h1 className="text-4xl font-bold tracking-tight text-foreground lg:text-5xl">
                The Connected Enterprise AI Playbook
              </h1>
              <p className="text-lg text-muted-foreground">
                Based on insights from +100 customers including
              </p>
            </div>

            {/* Customer logos */}
            <div className="flex flex-wrap items-center gap-6">
              {CUSTOMER_LOGOS.map((logo) => (
                <div key={logo.alt} className="relative h-10 w-28">
                  <Image
                    src={logo.src}
                    alt={logo.alt}
                    layout="fill"
                    objectFit="contain"
                  />
                </div>
              ))}
            </div>

            {/* Ebook cover */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl">
              <Image
                src="/static/landing/ebook/ebook.png"
                alt="The Connected Enterprise AI Playbook"
                layout="fill"
                objectFit="cover"
              />
            </div>

            {/* Description */}
            <p className="text-base text-muted-foreground">
              This playbook distills the lessons learned from over 100 companies
              using Dust to deploy AI agents across their organizations. Whether
              you&apos;re just getting started or scaling enterprise-wide, this
              guide gives you the frameworks, examples, and best practices you
              need.
            </p>

            {/* You'll learn section */}
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-semibold text-foreground">
                You&apos;ll learn
              </h2>
              <ol className="flex flex-col gap-3">
                {LEARNING_POINTS.map((point, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="text-base text-muted-foreground">
                      {point}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Right column — Form */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <EbookForm />
          </div>
        </div>
      </div>
    </>
  );
}

EbookLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
