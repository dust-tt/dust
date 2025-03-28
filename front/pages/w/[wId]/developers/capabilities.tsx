import { CommandLineIcon, Page, Spinner } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { CapabilitiesList } from "@app/components/actions/mcp/CapabilitiesList";
import { subNavigationAdmin } from "@app/components/navigation/config";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import { useMcpServers } from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
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

  return {
    props: {
      owner,
      isAdmin: auth.isAdmin(),
      subscription,
    },
  };
});

export default function Capabilities({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { mcpServers } = useMcpServers({
    owner,
    space: (spaces ?? []).find((space) => space.kind === "system"),
    filter: "all",
  });

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
          {!mcpServers ? (
            <Spinner />
          ) : (
            <CapabilitiesList capabilities={mcpServers} owner={owner} />
          )}
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}
