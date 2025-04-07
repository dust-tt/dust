import { Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";

import { AdminActionsList } from "@app/components/actions/mcp/ActionsList";
import { MCPServerDetails } from "@app/components/actions/mcp/MCPServerDetails";
import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import { ACTION_SPECIFICATIONS } from "@app/lib/actions/utils";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SubscriptionType, WorkspaceType } from "@app/types";

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

  await MCPServerViewResource.ensureAllDefaultActionsAreCreated(auth);

  return {
    props: {
      owner,
      isAdmin: auth.isAdmin(),
      subscription,
    },
  };
});

export default function AdminActions({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [mcpServer, setMcpServer] = useState<MCPServerType | null>(null);
  const [isDetailsPanelOpened, setIsDetailsPanelOpened] = useState(false);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "actions" })}
    >
      {mcpServer && (
        <MCPServerDetails
          owner={owner}
          mcpServer={mcpServer}
          onClose={() => {
            setIsDetailsPanelOpened(false);
          }}
          isOpen={isDetailsPanelOpened}
        />
      )}

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Actions"
          icon={ACTION_SPECIFICATIONS["MCP"].cardIcon}
          description="Actions let you connect tools and automate tasks. Find all available actions here and set up new ones."
        />
        <Page.Vertical align="stretch" gap="md">
          <AdminActionsList
            owner={owner}
            setMcpServer={(mcpServer) => {
              setMcpServer(mcpServer);
              setIsDetailsPanelOpened(true);
            }}
          />
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}
