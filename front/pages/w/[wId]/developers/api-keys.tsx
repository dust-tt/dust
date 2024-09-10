import { Page, ShapesIcon } from "@dust-tt/sparkle";
import type { GroupType, UserType, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import React from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { APIKeys } from "@app/pages/w/[wId]/vaults/[vaultId]/apps";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  groups: GroupType[];
  user: UserType;
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();
  const user = auth.getNonNullableUser();
  if (!auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  const groups = await auth.groups();

  return {
    props: {
      owner,
      groups,
      subscription,
      gaTrackingId: config.getGaTrackingId(),
      user,
    },
  };
});

export default function APIKeysPage({
  owner,
  subscription,
  groups,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      subNavigation={subNavigationAdmin({ owner, current: "api_keys" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="API Keys"
          icon={ShapesIcon}
          description="Manage your API Keys. API Keys allows you to securely connect to Dust from other applications and work with your data."
        />
        <Page.Vertical align="stretch" gap="md">
          <APIKeys owner={owner} groups={groups} />
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}
