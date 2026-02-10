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
import { useEffect } from "react";

import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AppContentLayout } from "@app/components/sparkle/AppContentLayout";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

export function MCPActionsDashboardPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const router = useAppRouter();

  const { featureFlags, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const { agentConfigurations, isAgentConfigurationsLoading } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list",
      includes: [],
    });

  // Redirect if feature flag is not enabled.
  useEffect(() => {
    if (
      !isFeatureFlagsLoading &&
      !featureFlags.includes("labs_mcp_actions_dashboard")
    ) {
      void router.replace(`/w/${owner.sId}/labs`);
    }
  }, [featureFlags, isFeatureFlagsLoading, owner.sId, router]);

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

  const isLoading =
    isFeatureFlagsLoading ||
    !featureFlags.includes("labs_mcp_actions_dashboard");

  return (
    <AppContentLayout
      contentWidth="centered"
      subscription={subscription}
      owner={owner}
      pageTitle="Dust - MCP Actions Dashboard"
      navChildren={<AgentSidebarMenu owner={owner} />}
    >
      {isLoading ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
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
                              color={
                                agent.scope === "global" ? "primary" : "green"
                              }
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
        </>
      )}
    </AppContentLayout>
  );
}
