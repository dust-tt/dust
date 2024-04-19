import { Button, RocketIcon } from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import React, { useState } from "react";

import { HeaderContentBlock } from "@app/components/home/new/ContentBlocks";
import { Grid } from "@app/components/home/new/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/new/LandingLayout";
import LandingLayout from "@app/components/home/new/LandingLayout";
import { PricePlans } from "@app/components/PlansTables";
import { SubscriptionContactUsDrawer } from "@app/components/SubscriptionContactUsDrawer";
import config from "@app/lib/api/config";
import { getSession } from "@app/lib/auth";
import { getUserFromSession } from "@app/lib/iam/session";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  gaTrackingId: string;
  shape: number;
}>(async (context) => {
  // Fetch session explicitly as this page redirects logged in users to our home page.
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  if (user && user.workspaces.length > 0) {
    let url = `/w/${user.workspaces[0].sId}`;

    if (context.query.inviteToken) {
      url = `/api/login?inviteToken=${context.query.inviteToken}`;
    }

    return {
      redirect: {
        destination: url,
        permanent: false,
      },
    };
  }

  return {
    props: { gaTrackingId: config.getGaTrackingId(), shape: 2 },
  };
});

export default function Pricing() {
  const [showContactUsDrawer, setShowContactUsDrawer] =
    useState<boolean>(false);

  return (
    <>
      <SubscriptionContactUsDrawer
        show={showContactUsDrawer}
        onClose={() => {
          setShowContactUsDrawer(false);
        }}
      />
      <HeaderContentBlock
        title={
          <>
            Start with Dust!
            <br />
            Meet our pricing plans.
          </>
        }
        from="from-sky-200"
        to="to-blue-500"
        subtitle={
          <>
            <div>
              <Button
                variant="primary"
                size="md"
                label="Start with Dust Pro, 15 Days free trial"
                icon={RocketIcon}
                onClick={() => {
                  window.location.href = "/api/auth/login";
                }}
              />
            </div>
          </>
        }
      />
      <Grid>
        <div className="s-dark col-span-12 flex flex-row justify-center md:col-span-10 md:col-start-2 lg:px-2 2xl:px-24">
          <PricePlans
            display="landing"
            size="xs"
            className="lg:hidden"
            isTabs
            onClickProPlan={() => {
              window.location.href = "/api/auth/login";
            }}
            onClickEnterprisePlan={() => setShowContactUsDrawer(true)}
          />
          <PricePlans
            display="landing"
            size="xs"
            className="hidden lg:flex xl:hidden"
            onClickProPlan={() => {
              window.location.href = "/api/auth/login";
            }}
            onClickEnterprisePlan={() => setShowContactUsDrawer(true)}
          />
          <PricePlans
            display="landing"
            size="sm"
            className="hidden xl:flex"
            onClickProPlan={() => {
              window.location.href = "/api/auth/login";
            }}
            onClickEnterprisePlan={() => setShowContactUsDrawer(true)}
          />
        </div>
      </Grid>
    </>
  );
}

Pricing.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
