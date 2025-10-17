import { useCallback, useMemo, useState } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { useSendNotification } from "@app/hooks/useNotification";
import type {
  AgentMessageFeedbackType,
  AgentMessageFeedbackWithMetadataType,
} from "@app/lib/api/assistant/feedback";
import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { FetchAssistantTemplatesResponse } from "@app/pages/api/templates";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { GetAgentConfigurationAnalyticsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/analytics";
import type { GetToolExecutionResponse } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/observability/tool-execution";
import type { GetUsageMetricsResponse } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/observability/usage-metrics";
import type { GetVersionMarkersResponse } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/observability/version-markers";
import type { GetAgentUsageResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/usage";
import type { GetSlackChannelsLinkedWithAgentResponseBody } from "@app/pages/api/w/[wId]/assistant/builder/slack/channels_linked_with_agent";
import type { PostAgentUserFavoriteRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_favorite";
import type {
  AgentConfigurationType,
  AgentsGetViewType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  UserType,
} from "@app/types";
import { normalizeError } from "@app/types";

export function useAssistantTemplates() {
  const assistantTemplatesFetcher: Fetcher<FetchAssistantTemplatesResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/templates`,
    assistantTemplatesFetcher
  );

  return {
    assistantTemplates: data?.templates ?? emptyArray(),
    isAssistantTemplatesLoading: !error && !data,
    isAssistantTemplatesError: error,
    mutateAssistantTemplates: mutate,
  };
}

export function useAssistantTemplate({
  templateId,
}: {
  templateId: string | null;
}) {
  const assistantTemplateFetcher: Fetcher<FetchAssistantTemplateResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    templateId !== null ? `/api/templates/${templateId}` : null,
    assistantTemplateFetcher
  );

  return {
    assistantTemplate: data ? data : null,
    isAssistantTemplateLoading: !error && !data,
    isAssistantTemplateError: error,
    mutateAssistantTemplate: mutate,
  };
}

/*
 * Agent configurations. A null agentsGetView means no fetching
 */
export function useAgentConfigurations({
  workspaceId,
  agentsGetView,
  includes = [],
  limit,
  sort,
  disabled,
  revalidate,
}: {
  workspaceId: string;
  agentsGetView: AgentsGetViewType | null;
  includes?: ("authors" | "usage" | "feedbacks" | "editors")[];
  limit?: number;
  sort?: "alphabetical" | "priority";
  disabled?: boolean;
  revalidate?: boolean;
}) {
  const agentConfigurationsFetcher: Fetcher<GetAgentConfigurationsResponseBody> =
    fetcher;

  // Function to generate query parameters.
  function getQueryString() {
    const params = new URLSearchParams();
    if (typeof agentsGetView === "string") {
      params.append("view", agentsGetView);
    }
    if (includes.includes("usage")) {
      params.append("withUsage", "true");
    }
    if (includes.includes("authors")) {
      params.append("withAuthors", "true");
    }
    if (includes.includes("editors")) {
      params.append("withEditors", "true");
    }
    if (includes.includes("feedbacks")) {
      params.append("withFeedbacks", "true");
    }

    if (limit) {
      params.append("limit", limit.toString());
    }

    if (sort) {
      params.append("sort", sort);
    }

    return params.toString();
  }

  const queryString = getQueryString();

  const key = `/api/w/${workspaceId}/assistant/agent_configurations?${queryString}`;
  const { cache } = useSWRConfig();
  const inCache = typeof cache.get(key) !== "undefined";

  const { data, error, mutate, mutateRegardlessOfQueryParams, isValidating } =
    useSWRWithDefaults(agentsGetView ? key : null, agentConfigurationsFetcher, {
      disabled,
      revalidateOnMount: !inCache || revalidate,
      revalidateOnFocus: !inCache || revalidate,
    });

  return {
    agentConfigurations: data
      ? data.agentConfigurations
      : emptyArray<LightAgentConfigurationType>(),
    isAgentConfigurationsLoading: !error && !data && !disabled,
    isAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
    isAgentConfigurationsValidating: isValidating,
  };
}

export function useSuggestedAgentConfigurations({
  workspaceId,
  conversationId,
  messageId,
  disabled,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  disabled?: boolean;
}) {
  const agentConfigurationsFetcher: Fetcher<GetAgentConfigurationsResponseBody> =
    fetcher;

  const key = `/api/w/${workspaceId}/assistant/conversations/${conversationId}/suggest?messageId=${messageId}`;
  const { cache } = useSWRConfig();
  const cachedData: GetAgentConfigurationsResponseBody | undefined =
    cache.get(key)?.data;
  const inCache = typeof cachedData !== "undefined";

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(key, agentConfigurationsFetcher, {
      disabled: inCache || disabled,
    });

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const dataToUse = cachedData || data;

  return {
    suggestedAgentConfigurations:
      dataToUse?.agentConfigurations ?? emptyArray(),
    isSuggestedAgentConfigurationsLoading: !error && !dataToUse && !disabled,
    isSuggestedAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}

// This is the call that is required for the new conversation page to load all views on that page.
// All elements that are involved in that page should rely on it to avoid concurrent calls to
// getAgentConfigurations at the initial page load.
export function useUnifiedAgentConfigurations({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const {
    agentConfigurations: agentConfigurationsWithAuthors,
    isAgentConfigurationsLoading: isAgentConfigurationsWithAuthorsLoading,
    isAgentConfigurationsValidating,
    mutate,
    mutateRegardlessOfQueryParams,
  } = useAgentConfigurations({
    workspaceId,
    agentsGetView: "list",
    includes: ["authors", "usage"],
    disabled,
  });

  return {
    agentConfigurations: agentConfigurationsWithAuthors,
    isLoading:
      isAgentConfigurationsWithAuthorsLoading ||
      isAgentConfigurationsValidating,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}

export function useAgentConfiguration({
  workspaceId,
  agentConfigurationId,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  disabled?: boolean;
}) {
  const agentConfigurationFetcher: Fetcher<{
    agentConfiguration: AgentConfigurationType;
  }> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    agentConfigurationId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}`
      : null,
    agentConfigurationFetcher,
    { disabled }
  );

  return {
    agentConfiguration: data ? data.agentConfiguration : null,
    isAgentConfigurationLoading: !error && !data && !disabled,
    isAgentConfigurationError: error,
    isAgentConfigurationValidating: isValidating,
    mutateAgentConfiguration: mutate,
  };
}

interface AgentConfigurationFeedbacksByDescVersionProps {
  workspaceId: string;
  agentConfigurationId: string | null;
  limit: number;
}

export function useAgentConfigurationFeedbacksByDescVersion({
  workspaceId,
  agentConfigurationId,
  limit,
}: AgentConfigurationFeedbacksByDescVersionProps) {
  const agentConfigurationFeedbacksFetcher: Fetcher<{
    feedbacks: (
      | AgentMessageFeedbackType
      | AgentMessageFeedbackWithMetadataType
    )[];
  }> = fetcher;

  const urlParams = new URLSearchParams({
    limit: limit.toString(),
    orderColumn: "id",
    orderDirection: "desc",
    withMetadata: "true",
  });

  const [hasMore, setHasMore] = useState(true);

  const { data, error, mutate, size, setSize, isLoading, isValidating } =
    useSWRInfiniteWithDefaults(
      (pageIndex: number, previousPageData) => {
        if (!agentConfigurationId) {
          return null;
        }

        // If we have reached the last page and there are no more
        // messages or the previous page has no messages, return null.
        if (previousPageData && previousPageData.feedbacks.length < limit) {
          setHasMore(false);
          return null;
        }

        if (previousPageData !== null) {
          const lastIdValue =
            previousPageData.feedbacks[previousPageData.feedbacks.length - 1]
              .id;
          urlParams.append("lastValue", lastIdValue.toString());
        }
        return `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/feedbacks?${urlParams.toString()}`;
      },
      agentConfigurationFeedbacksFetcher,
      {
        revalidateAll: false,
        revalidateOnFocus: false,
      }
    );

  return {
    isLoadingInitialData: !error && !data,
    isAgentConfigurationFeedbacksError: error,
    isAgentConfigurationFeedbacksLoading: isLoading,
    isValidating,
    agentConfigurationFeedbacks: useMemo(
      () => (data ? data.flatMap((d) => (d ? d.feedbacks : [])) : []),
      [data]
    ),
    hasMore,
    mutateAgentConfigurationFeedbacks: mutate,
    setSize,
    size,
  };
}

export function useAgentConfigurationHistory({
  workspaceId,
  agentConfigurationId,
  limit,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  limit?: number;
  disabled?: boolean;
}) {
  const agentConfigurationHistoryFetcher: Fetcher<{
    history: AgentConfigurationType[];
  }> = fetcher;

  const queryParams = limit ? `?limit=${limit}` : "";
  const { data, error, mutate } = useSWRWithDefaults(
    agentConfigurationId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/history${queryParams}`
      : null,
    agentConfigurationHistoryFetcher,
    { disabled }
  );

  return {
    agentConfigurationHistory: data?.history,
    isAgentConfigurationHistoryLoading: !error && !data,
    isAgentConfigurationHistoryError: error,
    mutateAgentConfigurationHistory: mutate,
  };
}

export function useAgentConfigurationLastAuthor({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
}) {
  const userFetcher: Fetcher<{
    user: UserType;
  }> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/last_author`,
    userFetcher
  );

  return {
    agentLastAuthor: data ? data.user : null,
    isLoading: !error && !data,
    isError: error,
  };
}

export function useAgentUsage({
  workspaceId,
  agentConfigurationId,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  disabled?: boolean;
}) {
  const agentUsageFetcher: Fetcher<GetAgentUsageResponseBody> = fetcher;
  const fetchUrl = agentConfigurationId
    ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/usage`
    : null;
  const { data, error, mutate } = useSWRWithDefaults(
    fetchUrl,
    agentUsageFetcher,
    { disabled }
  );

  return {
    agentUsage: data ? data.agentUsage : null,
    isAgentUsageLoading: !error && !data && !disabled,
    isAgentUsageError: error,
    mutateAgentUsage: mutate,
  };
}

export function useAgentAnalytics({
  workspaceId,
  agentConfigurationId,
  period,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  period: number;
  disabled?: boolean;
}) {
  const agentAnalyticsFetcher: Fetcher<GetAgentConfigurationAnalyticsResponseBody> =
    fetcher;
  const fetchUrl = agentConfigurationId
    ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/analytics?period=${period}`
    : null;
  const { data, error } = useSWRWithDefaults(fetchUrl, agentAnalyticsFetcher, {
    disabled,
  });

  return {
    agentAnalytics: data ? data : null,
    isAgentAnalyticsLoading: !error && !data && !disabled,
    isAgentAnalyticsError: error,
  };
}

export function useSlackChannelsLinkedWithAgent({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const slackChannelsLinkedWithAgentFetcher: Fetcher<GetSlackChannelsLinkedWithAgentResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/builder/slack/channels_linked_with_agent`,
    slackChannelsLinkedWithAgentFetcher,
    {
      disabled: !!disabled,
    }
  );

  return {
    provider: data?.provider ?? "slack",
    slackChannels: data?.slackChannels ?? emptyArray(),
    slackDataSource: data?.slackDataSource,
    isSlackChannelsLoading: !error && !data,
    isSlackChannelsError: error,
    mutateSlackChannels: mutate,
  };
}

// Convenient hooks to do CRUD operations on agent configurations

export function useDeleteAgentConfiguration({
  owner,
  agentConfiguration,
}: {
  owner: LightWorkspaceType;
  agentConfiguration?: LightAgentConfigurationType;
}) {
  const sendNotification = useSendNotification();
  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list", // Anything would work
      disabled: true, // We only use the hook to mutate the cache
    });

  const { mutateAgentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration?.sId ?? null,
    disabled: true, // We only use the hook to mutate the cache
  });

  const doDelete = async () => {
    if (!agentConfiguration) {
      return;
    }
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}`,
      {
        method: "DELETE",
      }
    );

    if (res.ok) {
      void mutateAgentConfiguration();
      void mutateAgentConfigurations();

      sendNotification({
        type: "success",
        title: `Successfully deleted ${agentConfiguration.name}`,
        description: `${agentConfiguration.name} was successfully archived.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error archiving ${agentConfiguration.name}`,
        description: `Error: ${errorData.message}`,
      });
    }
    return res.ok;
  };

  return doDelete;
}

export function useBatchDeleteAgentConfigurations({
  owner,
  agentConfigurationIds,
}: {
  owner: LightWorkspaceType;
  agentConfigurationIds: string[];
}) {
  const sendNotification = useSendNotification();
  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list", // Anything would work
      disabled: true, // We only use the hook to mutate the cache
    });

  const doDelete = async () => {
    if (agentConfigurationIds.length === 0) {
      return;
    }
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentConfigurationIds,
        }),
      }
    );

    if (res.ok) {
      void mutateAgentConfigurations();

      sendNotification({
        type: "success",
        title: `Successfully archived agents`,
        description: `${agentConfigurationIds.length} agents were successfully archived.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error archiving agents`,
        description: `Error: ${errorData.message}`,
      });
    }
    return res.ok;
  };

  return doDelete;
}

export function useUpdateUserFavorite({
  owner,
  agentConfigurationId,
}: {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateAgentConfiguration: mutateCurrentAgentConfiguration } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId,
      disabled: true,
    });
  const { mutate: mutateAgentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
    disabled: true,
  });

  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false);

  const doUpdate = useCallback(
    async (userFavorite: boolean) => {
      setIsUpdatingFavorite(true);
      try {
        const body: PostAgentUserFavoriteRequestBody = {
          agentId: agentConfigurationId,
          userFavorite: userFavorite,
        };

        const res = await fetch(
          `/api/w/${owner.sId}/members/me/agent_favorite`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (res.ok) {
          sendNotification({
            title: `Assistant ${
              userFavorite ? "added to favorites" : "removed from favorites"
            }`,
            type: "success",
          });
          await mutateCurrentAgentConfiguration();
          await mutateAgentConfigurations();
          return true;
        } else {
          const data = await res.json();
          sendNotification({
            title: `Error ${userFavorite ? "adding" : "removing"} Assistant`,
            description: data.error.message,
            type: "error",
          });
          return false;
        }
      } catch (error) {
        sendNotification({
          title: `Error updating agent list.`,
          description:
            normalizeError(error).message || "An unknown error occurred",
          type: "error",
        });
        return false;
      } finally {
        setIsUpdatingFavorite(false);
      }
    },
    [
      agentConfigurationId,
      mutateAgentConfigurations,
      mutateCurrentAgentConfiguration,
      owner.sId,
      sendNotification,
    ]
  );
  return { updateUserFavorite: doUpdate, isUpdatingFavorite };
}

export function useRestoreAgentConfiguration({
  owner,
  agentConfiguration,
}: {
  owner: LightWorkspaceType;
  agentConfiguration?: LightAgentConfigurationType;
}) {
  const sendNotification = useSendNotification();
  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list", // Anything would work
      disabled: true, // We only use the hook to mutate the cache
    });

  const { mutateAgentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration?.sId ?? null,
    disabled: true, // We only use the hook to mutate the cache
  });

  const doRestore = async () => {
    if (!agentConfiguration) {
      return;
    }
    const res = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/restore`,
      {
        method: "POST",
      }
    );

    if (res.ok) {
      void mutateAgentConfiguration();
      void mutateAgentConfigurations();

      sendNotification({
        type: "success",
        title: `Successfully restored ${agentConfiguration.name}`,
        description: `${agentConfiguration.name} was successfully restored.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error restoring ${agentConfiguration.name}`,
        description: `Error: ${errorData.message}`,
      });
    }
    return res.ok;
  };

  return doRestore;
}

export function useBatchUpdateAgentTags({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const batchUpdateAgentTags = useCallback(
    async (
      agentIds: string[],
      body: { addTagIds?: string[]; removeTagIds?: string[] }
    ) => {
      await fetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/batch_update_tags`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agentIds,
            ...body,
          }),
        }
      );
    },
    [owner]
  );

  return batchUpdateAgentTags;
}

export function useBatchUpdateAgentScope({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const batchUpdateAgentScope = useCallback(
    async (agentIds: string[], body: { scope: "visible" | "hidden" }) => {
      await fetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/batch_update_scope`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agentIds,
            ...body,
          }),
        }
      );
    },
    [owner]
  );

  return batchUpdateAgentScope;
}

export function useAgentUsageMetrics({
  workspaceId,
  agentConfigurationId,
  days = DEFAULT_PERIOD_DAYS,
  interval = "day",
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  days?: number;
  interval?: "day" | "week";
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetUsageMetricsResponse> = fetcher;
  const key = `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/observability/usage-metrics?days=${days}&interval=${interval}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    usageMetrics: data ?? null,
    isUsageMetricsLoading: !error && !data && !disabled,
    isUsageMetricsError: error,
    isUsageMetricsValidating: isValidating,
  };
}

export function useAgentVersionMarkers({
  workspaceId,
  agentConfigurationId,
  days = DEFAULT_PERIOD_DAYS,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  days?: number;
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetVersionMarkersResponse> = fetcher;
  const key = `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/observability/version-markers?days=${days}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    versionMarkers: data?.versionMarkers ?? null,
    isVersionMarkersLoading: !error && !data && !disabled,
    isVersionMarkersError: error,
    isVersionMarkersValidating: isValidating,
  };
}

export function useAgentToolExecution({
  workspaceId,
  agentConfigurationId,
  days = 30,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  days?: number;
  size?: number;
  disabled?: boolean;
}) {
  const fetcherFn: Fetcher<GetToolExecutionResponse> = fetcher;
  const key = `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/observability/tool-execution?days=${days}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    toolExecutionByVersion: data?.byVersion ?? null,
    isToolExecutionLoading: !error && !data && !disabled,
    isToolExecutionError: error,
    isToolExecutionValidating: isValidating,
  };
}
