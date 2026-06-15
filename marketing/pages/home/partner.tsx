import {
  HomeReveal,
  HomeRevealStyles,
} from "@marketing/components/home/content/Product/HomeReveal";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import { PartnerForm } from "@marketing/components/home/PartnerForm";
import {
  PartnerHero,
  PartnerIdealPartners,
  PartnerSocialProof,
} from "@marketing/components/home/PartnerHero";
import { Button } from "@dust-tt/sparkle";
import type { GetStaticProps } from "next";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

// Temporarily route partner sign-ups to a HubSpot-hosted form while we fix
// tracking on the embedded PartnerForm. Flip back to true once resolved.
const SHOW_PARTNER_FORM = false;
const PARTNER_HUBSPOT_FORM_URL =
  "https://share-eu1.hsforms.com/2FctvfmFxRQqllduT_JmlTA2dzwm3";

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      shape: 0,
    },
  };
};

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Partner() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Become a Dust Partner: Join Our Partner Network"
        description="Partner with Dust to help businesses deploy AI agents. Join our network of resellers, implementation partners, and technology partners."
        pathname={router.asPath}
      />
      <HomeRevealStyles />
      <div className="flex w-full flex-col gap-24 md:gap-32 md:px-12 lg:px-32">
        <PartnerHero />
        <PartnerIdealPartners />
      </div>

      {/* Closing waitlist CTA — full-bleed dark section borrowed from the
          homepage's HomeAIOperatorsCTASection. Sits flush before the footer,
          with breathing room above it from the LandingLayout content gap. */}
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
        <section className="relative w-full overflow-hidden bg-slate-950 py-28 text-white md:py-32">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          <div className="mx-auto flex w-full max-w-[820px] flex-col items-center gap-8 px-6 text-center">
            <HomeReveal>
              <span className="inline-flex h-7 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-white/70 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                Partner waitlist
              </span>
            </HomeReveal>
            <HomeReveal delay={80}>
              <h2 className="m-0 max-w-[760px] text-balance text-center text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-white md:text-5xl">
                Let&apos;s bring AI agents to your clients{" "}
                <span
                  className="font-normal italic"
                  style={{
                    fontFamily:
                      'ui-serif, Georgia, Cambria, "Times New Roman", serif',
                  }}
                >
                  together
                </span>
                .
              </h2>
            </HomeReveal>
            <HomeReveal delay={160} className="max-w-[620px]">
              <p className="m-0 text-base leading-[1.6] text-white/70">
                Partners are central to our next stage at Dust. Join the
                waitlist and we&apos;ll reach out as soon as we&apos;re ready to
                explore a partnership with you.
              </p>
            </HomeReveal>
            <HomeReveal delay={240} className="mt-2 flex flex-col items-center">
              {SHOW_PARTNER_FORM ? (
                <PartnerForm />
              ) : (
                <a
                  href={PARTNER_HUBSPOT_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="active:scale-[0.97] inline-block transition-transform duration-100"
                >
                  <Button
                    variant="highlight"
                    size="md"
                    label="Join the waitlist"
                  />
                </a>
              )}
            </HomeReveal>
            <PartnerSocialProof />
          </div>
        </section>
      </div>
    </>
  );
}

Partner.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
