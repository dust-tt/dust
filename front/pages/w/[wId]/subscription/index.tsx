import { Button, Chip, Page, PageHeader, ShapesIcon } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import router from "next/router";
import React, { useContext } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { PlanType, UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  plan: PlanType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !auth.isAdmin() || !plan) {
    return {
      notFound: true,
    };
  }

  if (!isDevelopmentOrDustWorkspace(owner)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      plan,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function Subscription({
  user,
  owner,
  plan,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useContext(SendNotificationsContext);
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);

  async function handleSubscribeToPlan(planCode: string): Promise<void> {
    setIsProcessing(true);
    const res = await fetch(`/api/w/${owner.sId}/subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        planCode,
      }),
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Subscribtion failed",
        description: "Failed to subscribe to a new plan.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Success!",
        description: `Successfully subscribed to the new plan.`,
      });
    }
    setIsProcessing(false);

    // Reload the page to update the plan (that we load from the server)
    setTimeout(function () {
      router.reload();
    }, 1000);
  }

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "subscription" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <PageHeader
          title="Subscription"
          icon={ShapesIcon}
          description="Choose the plan that works for you."
        />
        <Page.Vertical align="stretch" gap="md">
          <Page.H variant="h5">Your plan </Page.H>
          <div>
            You're currently on the <Chip color="pink" label={plan.name} />{" "}
            plan.
          </div>

          <Page.H variant="h5">Manage my plan </Page.H>

          <div className="flex flex-row gap-2">
            <Button
              variant="primary"
              label="Subscribe to Pro"
              disabled={isProcessing || plan.code === "PRO_PLAN_MAU_29"}
              onClick={async () =>
                await handleSubscribeToPlan("PRO_PLAN_MAU_29")
              }
            />
            <Button
              variant="primary"
              label="Subscribe to Pro Fixed"
              disabled={isProcessing || plan.code === "PRO_PLAN_FIXED_1000"}
              onClick={async () =>
                await handleSubscribeToPlan("PRO_PLAN_FIXED_1000")
              }
            />
          </div>
        </Page.Vertical>
      </Page.Vertical>
    </AppLayout>
  );
}
