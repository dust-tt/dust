import type { AgentConfigurationScope, SubscriptionType } from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import * as React from "react";

import { SCOPE_INFO } from "@app/components/assistant_builder/Sharing";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import WorkspaceAssistants from "@app/pages/w/[wId]/builder/assistants";

// TODO(GROUPS_INFRA):
// This route is the copy of "Manage Assistants" page from  w/[wId]/builder/assistants.
// This is our way of still giving access to this page but without the Build sidebar menu.
// Once vault is rolled out and Build menu is removed we should keep only this version.
export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  tabScope: AgentConfigurationScope;
  gaTrackingId: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }
  const tabScope = Object.keys(SCOPE_INFO).includes(
    context.query.tabScope as AgentConfigurationScope
  )
    ? (context.query.tabScope as AgentConfigurationScope)
    : "workspace";
  return {
    props: {
      owner,
      tabScope,
      subscription,
      gaTrackingId: config.getGaTrackingId(),
    },
  };
});

export default function ManageAssistants({
  owner,
  tabScope,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <WorkspaceAssistants
      owner={owner}
      tabScope={tabScope}
      subscription={subscription}
      gaTrackingId={gaTrackingId}
      loadFromChatMenu={true}
    />
  );
}
