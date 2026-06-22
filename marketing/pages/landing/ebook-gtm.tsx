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
  "How AI operators build agent systems that level up their whole GTM team.",
  "The playbooks behind real gains at Vanta, Clay, Persona, and Watershed.",
  "Multi-agent patterns that turn 30 minutes of research into seconds and cut RFP time by 90%.",
  "A proven 5-step framework to pilot, prove ROI, and scale with enablement.",
  'The metrics that matter beyond "time saved": adoption, prep time, and pipeline impact.',
];

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function EbookGtmLandingPage() {
  return (
    <>
      <PageMetadata
        title="The AI-First GTM Playbook | Dust"
        description="Download the free ebook with best practices and customer stories from Sales, Growth, GTM Engineering, and Revenue Operations. Learn how AI operators deploy agents across GTM teams."
        pathname="/landing/ebook-gtm"
      />

      <HomeRevealStyles />

      <div className="mx-auto w-full max-w-[1280px] px-6 py-12 lg:px-10 lg:py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          {/* Left column — Content */}
          <div className="flex min-w-0 flex-col gap-10">
            <div className="flex flex-col gap-5">
              <HomeReveal>
                <HomeEyebrow label="Free ebook" />
              </HomeReveal>
              <HomeReveal delay={60}>
                <h1
                  className="m-0 text-balance text-[clamp(36px,4vw,60px)] font-semibold leading-[95%] tracking-[-0.03em] text-foreground"
                  style={{ fontFamily: "var(--font-sans, inherit)" }}
                >
                  The AI-First GTM
                  <br />
                  Playbook
                </h1>
              </HomeReveal>
              <HomeReveal delay={120}>
                <p className="copy-lg max-w-[520px] text-pretty leading-[1.55] text-muted-foreground">
                  Best practices and customer stories from Sales, Growth, GTM
                  Engineering, and Revenue Operations teams using Dust.
                </p>
              </HomeReveal>
              <HomeReveal delay={160} className="mt-2">
                <HomeTrustedMarqueeCompact />
              </HomeReveal>
            </div>

            {/* Ebook cover */}
            <HomeReveal delay={160} variant="photo">
              <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/5">
                <Image
                  src="/static/landing/ebook/ai-first-gtm-playbook-cover.svg"
                  alt="The AI-First GTM Playbook"
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
                  {LEARNING_POINTS.map((point) => (
                    <li key={point} className="flex items-start gap-3">
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

          {/* Right column — Form */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <EbookForm
              ebookTitle="The AI-First GTM Playbook"
              downloadEbookKey="ai-first-gtm-playbook"
            />
          </div>
        </div>
      </div>
    </>
  );
}

EbookGtmLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
