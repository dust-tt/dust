// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import { PricePlans } from "@app/components/plans/PlansTables";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
  withTracking,
} from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import { Button, RocketIcon } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function Pricing() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Dust Pricing: Pro and Enterprise Plans for AI Agents"
        description="Explore Dust pricing plans. Pro for small teams and startups, Enterprise for 100+ members with multiple workspaces and SSO. Start with a 14-day free trial."
        pathname={router.asPath}
      />
      <HeaderContentBlock
        title="Meet our pricing plans"
        hasCTA={false}
        subtitle={
          <>
            Pro: For small teams and startups, from 1 member. <br />
            Enterprise: From 100 members, multiple workspaces, SSO…
            <br />
            <br />
            <Button
              variant="highlight"
              size="md"
              label="Start with Pro, 14 days free"
              icon={RocketIcon}
              onClick={withTracking(
                TRACKING_AREAS.PRICING,
                "hero_start_trial",
                () => {
                  // eslint-disable-next-line react-hooks/immutability
                  window.location.href = appendUTMParams(
                    "/api/workos/login?screenHint=sign-up"
                  );
                }
              )}
            />
          </>
        }
      />
      <Grid>
        <div className="dark col-span-12 flex flex-row justify-center md:col-span-10 md:col-start-2 lg:px-2 2xl:px-24">
          <PricePlans
            display="landing"
            onClickProPlan={() => {
              trackEvent({
                area: TRACKING_AREAS.PRICING,
                object: "plan_card_start_trial",
                action: TRACKING_ACTIONS.CLICK,
              });
              window.location.href = appendUTMParams(
                "/api/workos/login?screenHint=sign-up"
              );
            }}
          />
        </div>
      </Grid>
    </>
  );
}

Pricing.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
