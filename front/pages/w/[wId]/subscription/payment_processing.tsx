import { BarHeader, Page, Spinner } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useEffect } from "react";

import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { getConversationRoute } from "@app/lib/utils/router";
import type { UserType, WorkspaceType } from "@app/types";
import type { SubscriptionType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user()?.toJSON();
  if (!owner || !auth.isAdmin() || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  if (subscription.stripeSubscriptionId) {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return {
        notFound: true,
      };
    }
    stripeSubscription;
  }

  return {
    props: {
      owner,
      subscription,
      user,
    },
  };
});

export default function PaymentProcessing({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  useEffect(() => {
    if (router.query.type === "succeeded") {
      if (subscription.plan.code === router.query.plan_code) {
        // Then we remove the query params to avoid going through this logic again.
        void router.replace(getConversationRoute(owner.sId, "new", "welcome=true"));
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
        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
          <div>
            <Spinner size="xl" />
          </div>
          <div>
            <Page.P>Processing</Page.P>
          </div>
        </div>
      </Page>
    </>
  );
}
