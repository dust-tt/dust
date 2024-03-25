import { BarHeader, Button, Page } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { CreditCardIcon } from "@heroicons/react/20/solid";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useEffect } from "react";

import { ProPriceTable } from "@app/components/PlansTables";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { getBrowserClient, trackPageView } from "@app/lib/amplitude/browser";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import { useUser } from "@app/lib/swr";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  owner: WorkspaceType;
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function Subscribe({
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);
  const { user } = useUser();

  useEffect(() => {
    const amplitude = getBrowserClient();
    if (user?.id) {
      const userId = `user-${user.id}`;
      amplitude.identify(userId);
      trackPageView({
        pathname: router.pathname,
        workspaceId: owner.sId,
      });
    }
  }, [owner.sId, router.pathname, user?.id]);

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
    } else {
      const content = await res.json();
      if (content.checkoutUrl) {
        await router.push(content.checkoutUrl);
      } else if (content.success) {
        sendNotification({
          type: "error",
          title: "Subscription failed",
          description:
            "Failed to subscribe to a new plan. Please try again in a few minutes.",
        });
      }
    }
  });

  return (
    <>
      <div className="mb-10">
        <BarHeader
          title={"Joining Dust"}
          className="ml-10 lg:ml-0"
          rightActions={
            <>
              <div className="flex flex-row items-center">
                {user && user.workspaces.length > 1 && (
                  <div className="mr-4 flex flex-row gap-2">
                    <div className="text-sm text-slate-500">Workspace:</div>
                    <WorkspacePicker
                      user={user}
                      workspace={owner}
                      readOnly={false}
                      displayDropDownOrigin="topRight"
                      onWorkspaceUpdate={(workspace) => {
                        const assistantRoute = `/w/${workspace.sId}/assistant/new`;
                        if (workspace.id !== owner.id) {
                          void router
                            .push(assistantRoute)
                            .then(() => router.reload());
                        }
                      }}
                    />
                  </div>
                )}
                <div>{user && <UserMenu user={user} />}</div>
              </div>
            </>
          }
        />
      </div>
      <Page>
        <Page.Horizontal>
          <Page.Vertical sizing="grow" gap="lg">
            <Page.Header
              icon={CreditCardIcon}
              title="Setting up your subscription"
            />
            <Page.P>
              <span className="font-bold">
                You can try the Pro plan for free for two weeks.
              </span>
            </Page.P>
            <Page.P>
              After your trial ends, you will be charged monthly. You can cancel
              at any time.
            </Page.P>
            <Button
              variant="primary"
              label="Start your trial"
              icon={CreditCardIcon}
              size="md"
              onClick={() => {
                void handleSubscribePlan();
              }}
            ></Button>
          </Page.Vertical>
          <Page.Vertical sizing="grow">
            <ProPriceTable display="subscribe" size="xs"></ProPriceTable>
          </Page.Vertical>
        </Page.Horizontal>
      </Page>
    </>
  );
}
