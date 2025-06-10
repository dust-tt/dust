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
import { useCallback, useEffect, useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type { GetMCPActionsResponseBody } from "@app/pages/api/w/[wId]/labs/mcp_actions/[agentId]";
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

  const agent = await getAgentConfiguration(auth, agentId, "light");
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
  const [allActions, setAllActions] = useState<
    Array<{
      sId: string;
      createdAt: string;
      functionCallName: string | null;
      params: Record<string, unknown>;
      executionState: string;
      isError: boolean;
      conversationId: string;
      messageId: string;
    }>
  >([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 25,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);

  const startIndex = pagination.pageIndex * pagination.pageSize;
  const endIndex = startIndex + pagination.pageSize;
  const currentPageActions = allActions.slice(startIndex, endIndex);

  // Check if we need to fetch more data
  const needsMoreData =
    pagination.pageIndex >=
      Math.floor(allActions.length / pagination.pageSize) &&
    cursors[cursors.length - 1] !== null;

  const fetchData = useCallback(async () => {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      const targetPageIndex = Math.floor(
        allActions.length / pagination.pageSize
      );
      const cursor = cursors[targetPageIndex] || null;
      const url = cursor
        ? `/api/w/${owner.sId}/labs/mcp_actions/${agentId}?limit=${pagination.pageSize}&cursor=${cursor}`
        : `/api/w/${owner.sId}/labs/mcp_actions/${agentId}?limit=${pagination.pageSize}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch MCP actions");
      }
      const data: GetMCPActionsResponseBody = await response.json();

      setAllActions((prev) => [...prev, ...data.actions]);
      setCursors((prev) => [...prev, data.nextCursor]);

      // Use the actual total count from the API
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [
    owner.sId,
    agentId,
    pagination.pageSize,
    allActions.length,
    cursors,
    isLoading,
  ]);

  useEffect(() => {
    if (needsMoreData) {
      void fetchData();
    }
  }, [needsMoreData, fetchData]);

  useEffect(() => {
    if (allActions.length === 0 && !isLoading) {
      void fetchData();
    }
  }, [allActions.length, isLoading, fetchData]);

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

  const getExecutionStateColor = (state: string) => {
    switch (state) {
      case "allowed_explicitly":
      case "allowed_implicitly":
        return "success";
      case "denied":
        return "warning";
      case "pending":
        return "info";
      case "timeout":
        return "warning";
      default:
        return "primary";
    }
  };

  const handleConversationLink = (
    conversationId: string,
    messageId: string
  ) => {
    if (conversationId && messageId) {
      window.open(`/w/${owner.sId}/assistant/${conversationId}`, "_blank");
    }
  };

  return (
    <ConversationsNavigationProvider>
      <AppContentLayout
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
            {isLoading && allActions.length === 0 ? (
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

                  {currentPageActions.length > 0 ? (
                    <>
                      {currentPageActions.map((action) => (
                        <ContextItem
                          key={action.sId}
                          title={action.functionCallName || "Unknown Action"}
                          visual={<Icon visual={ActionCodeBoxIcon} />}
                          action={
                            <div className="flex items-center gap-2">
                              <Chip
                                color={
                                  action.isError
                                    ? "warning"
                                    : getExecutionStateColor(
                                        action.executionState
                                      )
                                }
                                size="xs"
                              >
                                {action.isError
                                  ? "Error"
                                  : action.executionState.replace("_", " ")}
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
      </AppContentLayout>
    </ConversationsNavigationProvider>
  );
}

AgentMCPActions.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
