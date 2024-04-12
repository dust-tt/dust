import { BarHeader, Page, Spinner2 } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

import { PRO_PLAN_29_COST } from "@app/lib/client/subscription";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  trialDaysRemaining: number | null;
  gaTrackingId: string;
  workspaceSeats: number;
  estimatedMonthlyBilling: number;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();
  if (!owner || !auth.isAdmin() || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  let trialDaysRemaining = null;
  if (subscription.trialing && subscription.stripeSubscriptionId) {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return {
        notFound: true,
      };
    }
    stripeSubscription;
    trialDaysRemaining = stripeSubscription.trial_end
      ? Math.ceil(
          (stripeSubscription.trial_end * 1000 - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      : null;
  }
  const workspaceSeats = await countActiveSeatsInWorkspace(owner.sId);
  const estimatedMonthlyBilling = PRO_PLAN_29_COST * workspaceSeats;

  return {
    props: {
      owner,
      subscription,
      trialDaysRemaining,
      gaTrackingId: GA_TRACKING_ID,
      user,
      workspaceSeats,
      estimatedMonthlyBilling,
    },
  };
});

export default function Subscription({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  useState(false);
  useEffect(() => {
    if (router.query.type === "succeeded") {
      if (subscription.plan.code === router.query.plan_code) {
        // Then we remove the query params to avoid going through this logic again.
        void router.push(
          { pathname: `/w/${owner.sId}/congratulation` },
          undefined,
          {
            shallow: true,
          }
        );
      } else {
        // If the Stripe webhook is not yet received, we try waiting for it and reload the page every 5 seconds until it's done.
        setTimeout(() => {
          void router.reload();
        }, 5000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally passing an empty dependency array to execute only once

  return (
    <>
      <div className="mb-10">
        <BarHeader title={"Dust"} className="ml-10 lg:ml-0" />
      </div>
      <Page>
        <div className="flex h-full w-full flex-col	items-center justify-center gap-2">
          <div>
            <Spinner2 size="xl" />
          </div>
          <div>
            <Page.P>Processing</Page.P>
          </div>
        </div>
      </Page>
    </>
  );
}
