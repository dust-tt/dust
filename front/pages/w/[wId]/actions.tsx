import { CommandLineIcon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";

import { InternalMCPServerDetails } from "@app/components/actions/mcp/ActionDetails";
import { AdminActionsList } from "@app/components/actions/mcp/ActionsList";
import { RemoteMCPServerDetails } from "@app/components/actions/mcp/RemoteMCPServerDetails";
import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/mcp_icons";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import type { SubscriptionType, WorkspaceType } from "@app/types";
import { useMCPServerViews } from "@app/lib/swr/mcp_server_views";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";

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

export default function AdminActions({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [showDetails, setShowDetails] = useState<MCPServerType | null>(null);
  const serverType =
    showDetails && showDetails.id.startsWith("ims_") ? "internal" : "remote";

  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const systemSpace = (spaces ?? []).find((space) => space.kind === "system");

  const { mutateMCPServerViews } = useMCPServerViews({
    owner,
    space: systemSpace,
  });

  const EMPTY_MCP_SERVER = {
    id: "new",
    name: "",
    version: "",
    description: "",
    icon: DEFAULT_MCP_SERVER_ICON,
    tools: [],
  } as MCPServerType;

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "actions" })}
    >
      {serverType === "internal" && (
        <InternalMCPServerDetails
          owner={owner}
          mcpServer={showDetails}
          onClose={() => setShowDetails(null)}
        />
      )}

      {serverType === "remote" && (
        <RemoteMCPServerDetails
          owner={owner}
          mcpServer={showDetails}
          onClose={() => {
            setShowDetails(null)
            mutateMCPServerViews()
          }}
        />
      )}

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Actions"
          icon={CommandLineIcon}
          description="Actions let you connect tools and automate tasks. Find all available actions here and set up new ones."
        />
        <Page.Vertical align="stretch" gap="md">
          <AdminActionsList
            owner={owner}
            setShowDetails={setShowDetails}
            openRemoteMCPModal={() =>
              setShowDetails(EMPTY_MCP_SERVER)
            }
            spaces={spaces}
          />
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}
