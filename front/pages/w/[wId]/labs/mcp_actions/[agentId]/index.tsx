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
import type { InferGetServerSidePropsType } from "next";
import { useCallback } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useMCPActions } from "@app/lib/swr/mcp_actions";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  LightAgentConfigurationType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  agent: LightAgentConfigurationType;
  agentId: string;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();
  const agentId = _context.params?.agentId as string;

  if (!owner || !subscription || !user || !agentId) {
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

  if (!auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });
  if (!agent) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      agent,
      agentId,
    },
  };
});

export default function AgentMCPActions({
  owner,
  subscription,
  agent,
  agentId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { actions, totalCount, currentPage, isLoading, setPage } =
    useMCPActions({
      owner,
      agentId,
      pageSize: 25,
    });

  const pagination = {
    pageIndex: currentPage,
    pageSize: 25,
  };

  const setPagination = useCallback(
    (newPagination: { pageIndex: number; pageSize: number }) => {
      setPage(newPagination.pageIndex);
    },
    [setPage]
  );

  const items = [
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
      href: `/w/${owner.sId}/labs/mcp_actions/${agentId}`,
    },
  ];

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

  return (
    <ConversationsNavigationProvider>
      <AppCenteredLayout
        subscription={subscription}
        owner={owner}
        pageTitle={`Dust - MCP Actions for ${agent.name}`}
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <div className="mb-4">
          <Breadcrumbs items={items} />
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
                          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
                                >
                                  View Conversation
                                </Button>
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
      </AppCenteredLayout>
    </ConversationsNavigationProvider>
  );
}

AgentMCPActions.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
