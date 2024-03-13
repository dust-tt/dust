import { BarHeader, Button, Page } from "@dust-tt/sparkle";
import type { SubscriptionType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { CreditCardIcon } from "@heroicons/react/20/solid";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext } from "react";

import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { ProPriceTable } from "@app/components/PlansTables";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function Subscribe({
  owner,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  const { submit: handleSubscribePlan } = useSubmitFunction(async () => {
    const res = await fetch(`/api/w/${owner.sId}/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Subscription failed",
        description: "Failed to subscribe to a new plan.",
      });
      // Then we remove the query params to avoid going through this logic again.
      void router.push(
        { pathname: `/w/${owner.sId}/subscription` },
        undefined,
        {
          shallow: true,
        }
      );
    } else {
      const content = await res.json();
      if (content.checkoutUrl) {
        await router.push(content.checkoutUrl);
      } else if (content.success) {
        router.reload(); // We cannot swr the plan so we just reload the page.
      }
    }
  });

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      hideSidebar
      titleChildren={
        <BarHeader title={"Joining Dust"} className="ml-10 lg:ml-0" />
      }
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="conversations"
      navChildren={
        <AssistantSidebarMenu owner={owner} triggerInputAnimation={null} />
      }
    >
      <Page>
        <Page.Horizontal>
          <Page.Vertical sizing="grow" gap="lg">
            <Page.Header
              icon={CreditCardIcon}
              title="Setting up your subscription"
            />
            <Page.P>
              <span className="font-bold">Your first two weeks are free!</span>
            </Page.P>
            <Page.P>Cancel at any time, no question asked.</Page.P>
            <Page.P>
              After that, payments are monthly, subscription can be cancelled at
              any time.
            </Page.P>
            <Button
              variant="primary"
              label="Subscribe"
              icon={CreditCardIcon}
              size="md"
              onClick={() => {
                void handleSubscribePlan();
              }}
            ></Button>
          </Page.Vertical>
          <Page.Vertical sizing="grow">
            <ProPriceTable size="xs"></ProPriceTable>
          </Page.Vertical>
        </Page.Horizontal>
      </Page>
    </AppLayout>
  );
}
