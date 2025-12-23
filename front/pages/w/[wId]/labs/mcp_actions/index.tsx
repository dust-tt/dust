import {
  ActionCodeBoxIcon,
  Avatar,
  Breadcrumbs,
  Button,
  Chip,
  ContextItem,
  ExternalLinkIcon,
  Icon,
  Page,
  RobotIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type { SubscriptionType, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  if (!owner || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const flags = await getFeatureFlags(owner);
  if (!flags.includes("labs_mcp_actions_dashboard")) {
    return {
      notFound: true,
    };
  }

  // Only admins can access the MCP Actions Dashboard
  if (!auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
    },
  };
});

export default function MCPActionsDashboard({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { agentConfigurations, isAgentConfigurationsLoading } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list",
      includes: [],
    });

  const items = [
    {
      label: "Exploratory features",
      href: `/w/${owner.sId}/labs`,
    },
    {
      label: "MCP Actions Dashboard",
      href: `/w/${owner.sId}/labs/mcp_actions`,
    },
  ];

  const handleAgentSelect = (agentId: string) => {
    void router.push(`/w/${owner.sId}/labs/mcp_actions/${agentId}`);
  };

  const activeAgents =
    agentConfigurations?.filter((agent) => agent.status === "active") || [];

  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      pageTitle="Dust - MCP Actions Dashboard"
      navChildren={<AgentSidebarMenu owner={owner} />}
    >
      <div className="mb-4">
        <Breadcrumbs items={items} />
      </div>

      <Page>
        <Page.Header
          title="MCP Actions Dashboard"
          icon={ActionCodeBoxIcon}
          description="Monitor and track MCP (Model Context Protocol) actions executed by your agents."
        />

        <Page.Layout direction="vertical">
          {isAgentConfigurationsLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <ContextItem.List>
              <ContextItem.SectionHeader
                title="Active Agents"
                description={`${activeAgents.length} agent${activeAgents.length !== 1 ? "s" : ""} available for MCP action monitoring.`}
              />

              {activeAgents.length > 0 ? (
                activeAgents.map((agent) => (
                  <ContextItem
                    key={agent.sId}
                    title={agent.name}
                    visual={
                      <Avatar
                        size="sm"
                        name={agent.name}
                        visual={agent.pictureUrl}
                      />
                    }
                    action={
                      <div className="flex items-center gap-2">
                        <Chip
                          color={agent.scope === "global" ? "primary" : "green"}
                          size="xs"
                        >
                          {agent.scope === "global" ? "Default" : "Custom"}
                        </Chip>
                        <Button
                          size="sm"
                          variant="outline"
                          icon={ExternalLinkIcon}
                          onClick={() => handleAgentSelect(agent.sId)}
                          label="View Actions"
                        />
                      </div>
                    }
                  >
                    <ContextItem.Description
                      description={
                        agent.description || "No description available"
                      }
                    />
                  </ContextItem>
                ))
              ) : (
                <ContextItem
                  title="No Active Agents Found"
                  visual={<Icon visual={RobotIcon} />}
                >
                  <ContextItem.Description description="No active agents found in this workspace. Agents must be active to execute MCP actions." />
                </ContextItem>
              )}
            </ContextItem.List>
          )}
        </Page.Layout>
      </Page>
    </AppCenteredLayout>
  );
}

MCPActionsDashboard.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
