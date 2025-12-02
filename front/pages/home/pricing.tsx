import { Button, RocketIcon } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React from "react";

import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import { PricePlans } from "@app/components/plans/PlansTables";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  withTracking,
} from "@app/lib/tracking";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function Pricing() {
  const router = useRouter();

  return (
    <>
      <PageMetadata
        title="Dust Pricing: Pro and Enterprise Plans for AI Agents"
        description="Explore Dust pricing plans. Pro for small teams and startups, Enterprise for 100+ members with multiple workspaces and SSO. Start with a 15-day free trial."
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
              label="Start with Pro, 15 Days free"
              icon={RocketIcon}
              onClick={withTracking(
                TRACKING_AREAS.PRICING,
                "hero_start_trial",
                () => {
                  // eslint-disable-next-line react-hooks/immutability
                  window.location.href = "/api/workos/login?screenHint=sign-up";
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
              window.location.href = "/api/workos/login?screenHint=sign-up";
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
