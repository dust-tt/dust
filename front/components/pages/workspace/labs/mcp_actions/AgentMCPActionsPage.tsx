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
  Pagination,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect } from "react";

import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AppContentLayout } from "@app/components/sparkle/AppContentLayout";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, usePathParams } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useMCPActions } from "@app/lib/swr/mcp_actions";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getConversationRoute } from "@app/lib/utils/router";
import { isString } from "@app/types/shared/utils/general";

export function AgentMCPActionsPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const router = useAppRouter();
  const { agentId } = usePathParams();

  const { featureFlags, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const { agentConfiguration: agent, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: isString(agentId) ? agentId : null,
    });

  const { actions, totalCount, currentPage, isLoading, setPage } =
    useMCPActions({
      owner,
      agentId: isString(agentId) ? agentId : "",
      pageSize: 25,
    });

  const setPagination = useCallback(
    (newPagination: { pageIndex: number; pageSize: number }) => {
      setPage(newPagination.pageIndex);
    },
    [setPage]
  );

  // Redirect if feature flag is not enabled.
  useEffect(() => {
    if (
      !isFeatureFlagsLoading &&
      !featureFlags.includes("labs_mcp_actions_dashboard")
    ) {
      void router.replace(`/w/${owner.sId}/labs`);
    }
  }, [featureFlags, isFeatureFlagsLoading, owner.sId, router]);

  // Redirect if agent not found.
  useEffect(() => {
    if (!isAgentConfigurationLoading && !agent && isString(agentId)) {
      void router.replace(`/w/${owner.sId}/labs/mcp_actions`);
    }
  }, [agent, isAgentConfigurationLoading, agentId, owner.sId, router]);

  const pagination = {
    pageIndex: currentPage,
    pageSize: 25,
  };

  const formatParams = (params: Record<string, unknown>): string => {
    try {
      return JSON.stringify(params, null, 2);
    } catch {
      return String(params);
    }
  };

  const getExecutionStateColor = (state: ToolExecutionStatus) => {
    switch (state) {
      case "succeeded":
        return "success";
      case "denied":
      case "errored":
        return "warning";
      case "blocked_authentication_required":
      case "blocked_validation_required":
        return "info";
      default:
        return "primary";
    }
  };

  const handleConversationLink = (
    conversationId: string,
    messageId: string
  ) => {
    if (conversationId && messageId) {
      window.open(getConversationRoute(owner.sId, conversationId), "_blank");
    }
  };

  const isPageLoading =
    isFeatureFlagsLoading ||
    !featureFlags.includes("labs_mcp_actions_dashboard") ||
    isAgentConfigurationLoading ||
    !agent;

  return (
    <AppContentLayout
      contentWidth="centered"
      subscription={subscription}
      owner={owner}
      pageTitle={
        agent ? `Dust - MCP Actions for ${agent.name}` : "Dust - MCP Actions"
      }
      navChildren={<AgentSidebarMenu owner={owner} />}
    >
      {isPageLoading ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="mb-4">
            <Breadcrumbs
              items={[
                {
                  label: "Exploratory features",
                  href: `/w/${owner.sId}/labs`,
                },
                {
                  label: "MCP Actions Dashboard",
                  href: `/w/${owner.sId}/labs/mcp_actions`,
                },
                {
                  label: agent.name,
                  href: `/w/${owner.sId}/labs/mcp_actions/${agent.sId}`,
                },
              ]}
            />
          </div>

          <Page>
            <Page.Header
              title={`MCP Actions for ${agent.name}`}
              icon={ActionCodeBoxIcon}
              description={`View all MCP actions executed by the ${agent.name} agent.`}
            />

            {/* Agent info section */}
            <div className="mb-6 border-b border-gray-200 pb-4">
              <div className="flex items-center gap-3">
                <Avatar size="md" name={agent.name} visual={agent.pictureUrl} />
                <div className="flex flex-col">
                  <h3 className="text-lg font-medium text-foreground dark:text-foreground-night">
                    {agent.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Chip
                      color={agent.scope === "global" ? "primary" : "green"}
                      size="xs"
                    >
                      {agent.scope === "global"
                        ? "Default Agent"
                        : "Custom Agent"}
                    </Chip>
                    <Chip
                      color={agent.status === "active" ? "success" : "warning"}
                      size="xs"
                    >
                      {agent.status}
                    </Chip>
                  </div>
                  {agent.description && (
                    <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {agent.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Page.Layout direction="vertical">
              {isLoading && actions.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : (
                <>
                  <ContextItem.List>
                    <ContextItem.SectionHeader
                      title="Action History"
                      description={`${totalCount} MCP action${totalCount !== 1 ? "s" : ""} executed by this agent`}
                    />

                    {actions.length > 0 ? (
                      <>
                        {actions.map((action) => (
                          <ContextItem
                            key={action.sId}
                            title={action.functionCallName || "Unknown Action"}
                            visual={<Icon visual={ActionCodeBoxIcon} />}
                            action={
                              <div className="flex items-center gap-2">
                                <Chip
                                  color={
                                    action.status === "errored"
                                      ? "warning"
                                      : getExecutionStateColor(action.status)
                                  }
                                  size="xs"
                                >
                                  {action.status === "errored"
                                    ? "Error"
                                    : action.status.replace("_", " ")}
                                </Chip>
                                {action.conversationId && (
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    icon={ExternalLinkIcon}
                                    onClick={() =>
                                      handleConversationLink(
                                        action.conversationId,
                                        action.messageId
                                      )
                                    }
                                    label="View Conversation"
                                  />
                                )}
                              </div>
                            }
                          >
                            <div className="space-y-2">
                              <ContextItem.Description
                                description={`Executed on ${new Date(action.createdAt).toLocaleString()}`}
                              />
                              {Object.keys(action.params).length > 0 && (
                                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                                  <h4 className="mb-2 text-sm font-medium text-foreground dark:text-foreground-night">
                                    Input Parameters:
                                  </h4>
                                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground dark:text-muted-foreground-night">
                                    {formatParams(action.params)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </ContextItem>
                        ))}
                      </>
                    ) : (
                      <ContextItem
                        title="No Actions Found"
                        visual={<Icon visual={ActionCodeBoxIcon} />}
                      >
                        <ContextItem.Description description="No MCP actions have been executed by this agent yet." />
                      </ContextItem>
                    )}
                  </ContextItem.List>

                  {totalCount > pagination.pageSize && (
                    <div className="mt-4">
                      <Pagination
                        rowCount={totalCount}
                        pagination={pagination}
                        setPagination={setPagination}
                        size="sm"
                      />
                    </div>
                  )}
                </>
              )}
            </Page.Layout>
          </Page>
        </>
      )}
    </AppContentLayout>
  );
}
