import { CommandLineIcon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { ActionsList } from "@app/components/actions/mcp/ActionsList";
import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import type { SubscriptionType, WorkspaceType } from "@app/types";

export const ACTION_BUTTONS_CONTAINER_ID = "actions-buttons-container";

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();
  if (!auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("mcp_actions")) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      isAdmin: auth.isAdmin(),
      subscription,
    },
  };
});

export default function Actions({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "actions" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Actions"
          icon={CommandLineIcon}
          description="Actions let you connect tools and automate tasks. Find all available actions here and set up new ones."
        />
        <div id={ACTION_BUTTONS_CONTAINER_ID} className="flex gap-2" />
        <Page.Vertical align="stretch" gap="md">
          <ActionsList owner={owner} />
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}
