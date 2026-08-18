import { HomeEyebrow } from "@marketing/components/home/content/Product/HomeEyebrow";
import {
  HomeReveal,
  HomeRevealStyles,
} from "@marketing/components/home/content/Product/HomeReveal";
import { HomeTrustedMarqueeCompact } from "@marketing/components/home/content/Product/HomeTrustedSection";
import { EbookForm } from "@marketing/components/home/EbookForm";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import { Check } from "@dust-tt/sparkle";
import Image from "next/image";
import type { ReactElement } from "react";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      hideNavigation: true,
    },
  };
}

const LEARNING_POINTS = [
  "Why individual AI gains stop scaling, and how to build infrastructure that compounds across teams.",
  "The shift from Wave 2 (assistants) to Wave 3 (collaborative intelligence), and what it means for your stack.",
  "A week-by-week playbook to deploy AI Operators across at least 3 teams in under 3 months.",
  "How to spot, train, and empower the AI Operators already inside your company.",
  'The metrics that prove transformation, beyond "time saved": Operator density, capability gain, and the "remove AI tomorrow" test.',
];

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function EbookLandingPage() {
  return (
    <>
      <PageMetadata
        title="The AI Enterprise Playbook | Dust"
        description="Download the free ebook based on insights from 100+ customers. Learn how to build, deploy, and scale AI agents across your organization."
        pathname="/landing/ebook"
      />

      <HomeRevealStyles />

      <div className="mx-auto w-full max-w-[1280px] px-6 py-12 lg:px-10 lg:py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-x-16 lg:gap-y-0">
          {/* Heading — title & subtitle (stays on top at every breakpoint) */}
          <div className="order-1 flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
            <HomeReveal>
              <HomeEyebrow label="Free ebook" />
            </HomeReveal>
            <HomeReveal delay={60}>
              <h1
                className="m-0 text-balance text-[clamp(36px,4vw,60px)] font-semibold leading-[95%] tracking-[-0.03em] text-foreground"
                style={{ fontFamily: "var(--font-sans, inherit)" }}
              >
                The AI Enterprise
                <br />
                Playbook
              </h1>
            </HomeReveal>
            <HomeReveal delay={120}>
              <p className="copy-lg max-w-[520px] text-pretty leading-[1.55] text-muted-foreground">
                A leader&apos;s guide to building your AI Operator workforce,
                based on insights from 100+ companies using Dust.
              </p>
            </HomeReveal>
            <HomeReveal delay={160} className="mt-2">
              <HomeTrustedMarqueeCompact />
            </HomeReveal>
          </div>

          {/* Form — below the title on mobile, right column on desktop */}
          <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-start lg:sticky lg:top-8">
            <EbookForm />
          </div>

          {/* Remaining content — cover + what you'll learn */}
          <div className="order-3 flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-2 lg:mt-10">
            {/* Ebook cover */}
            <HomeReveal delay={160} variant="photo">
              <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/5">
                <Image
                  src="/static/landing/ebook/ai-enterprise-playbook-cover.svg"
                  alt="The AI Enterprise Playbook"
                  width={420}
                  height={595}
                  priority
                  className="h-auto w-full"
                />
              </div>
            </HomeReveal>

            {/* You'll learn section */}
            <HomeReveal delay={240}>
              <div className="flex flex-col gap-5">
                <h2 className="m-0 text-2xl font-semibold tracking-[-0.02em] text-foreground">
                  What you&apos;ll learn
                </h2>
                <ul className="flex flex-col gap-3">
                  {LEARNING_POINTS.map((point, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-base leading-[1.55] text-muted-foreground">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </HomeReveal>
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
