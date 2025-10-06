import { Button, RocketIcon } from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import React from "react";

import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import { PricePlans } from "@app/components/plans/PlansTables";

export async function getStaticProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.bigSphere),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function Pricing() {
  return (
    <>
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
              onClick={() => {
                window.location.href = "/api/workos/login?screenHint=sign-up";
              }}
            />
          </>
        }
      />
      <Grid>
        <div className="dark col-span-12 flex flex-row justify-center md:col-span-10 md:col-start-2 lg:px-2 2xl:px-24">
          <PricePlans
            display="landing"
            onClickProPlan={() => {
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
