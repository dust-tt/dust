import { CommandLineIcon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { CapabilitiesList } from "@app/components/actions/mcp/CapabilitiesList";
import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AVAILABLE_INTERNAL_MCPSERVER_IDS } from "@app/lib/actions/constants";
import type { MCPServerMetadata } from "@app/lib/actions/mcp_actions";
import { getMCPServerMetadataLocally } from "@app/lib/actions/mcp_actions";
import type { InternalMCPServerId } from "@app/lib/actions/mcp_internal_actions";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import type { SubscriptionType, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  capabilities: (MCPServerMetadata & { id: InternalMCPServerId })[];
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

  const capabilitiesMetadata = await Promise.all(
    AVAILABLE_INTERNAL_MCPSERVER_IDS.map(async (internalMCPServerId) => {
      const metadata = await getMCPServerMetadataLocally({
        serverType: "internal",
        internalMCPServerId,
      });
      return {
        ...metadata,
        tools: [],
        id: internalMCPServerId,
      };
    })
  );

  return {
    props: {
      owner,
      isAdmin: auth.isAdmin(),
      capabilities: capabilitiesMetadata,
      subscription,
    },
  };
});

export default function Capabilities({
  owner,
  capabilities,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "capabilities" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Capabilities"
          icon={CommandLineIcon}
          description="API Keys allow you to securely connect to Dust from other applications and work with your data programmatically."
        />
        <Page.Vertical align="stretch" gap="md">
          <CapabilitiesList capabilities={capabilities} owner={owner} />
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}
