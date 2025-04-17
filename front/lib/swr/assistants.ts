import { useSendNotification } from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

import type {
  AgentMessageFeedbackType,
  AgentMessageFeedbackWithMetadataType,
} from "@app/lib/api/assistant/feedback";
import {
  fetcher,
  getErrorFromResponse,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { FetchAssistantTemplatesResponse } from "@app/pages/api/templates";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { GetAgentConfigurationAnalyticsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/analytics";
import type { PostAgentScopeRequestBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/scope";
import type { GetAgentUsageResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/usage";
import type { GetSlackChannelsLinkedWithAgentResponseBody } from "@app/pages/api/w/[wId]/assistant/builder/slack/channels_linked_with_agent";
import type { PostAgentUserFavoriteRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_favorite";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentsGetViewType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  UserType,
} from "@app/types";

export function useAssistantTemplates() {
  const assistantTemplatesFetcher: Fetcher<FetchAssistantTemplatesResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/templates`,
    assistantTemplatesFetcher
  );

  return {
    assistantTemplates: useMemo(() => (data ? data.templates : []), [data]),
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
    assistantTemplate: useMemo(() => (data ? data : null), [data]),
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
  includes?: ("authors" | "usage" | "feedbacks")[];
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

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(agentsGetView ? key : null, agentConfigurationsFetcher, {
      disabled,
      revalidateOnMount: !inCache || revalidate,
      revalidateOnFocus: !inCache || revalidate,
    });

  return {
    agentConfigurations: useMemo(
      () => (data ? data.agentConfigurations : []),
      [data]
    ),
    isAgentConfigurationsLoading: !error && !data,
    isAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}

export function useAgentConfigurationsSuggestions({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}) {
  const agentConfigurationsFetcher: Fetcher<GetAgentConfigurationsResponseBody> =
    fetcher;

  const key = `/api/w/${workspaceId}/assistant/conversations/${conversationId}/suggest`;
  const { cache } = useSWRConfig();
  const cachedData: GetAgentConfigurationsResponseBody | undefined =
    cache.get(key)?.data;
  const inCache = typeof cachedData !== "undefined";

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(key, agentConfigurationsFetcher, {
      disabled: inCache,
    });

  const dataToUse = cachedData || data;

  return {
    agentConfigurations: useMemo(
      () => (dataToUse ? dataToUse.agentConfigurations : []),
      [dataToUse]
    ),
    isAgentConfigurationsLoading: !error && !dataToUse,
    isAgentConfigurationsError: error,
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
    isLoading: isAgentConfigurationsWithAuthorsLoading,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}

export function useAgentConfigurationSIdLookup({
  workspaceId,
  agentConfigurationName,
}: {
  workspaceId: string;
  agentConfigurationName: string | null;
}) {
  const sIdFetcher: Fetcher<{
    sId: string;
  }> = fetcher;

  const { data, error } = useSWRWithDefaults(
    agentConfigurationName
      ? `/api/w/${workspaceId}/assistant/agent_configurations/lookup?handle=${agentConfigurationName}`
      : null,
    sIdFetcher
  );

  return {
    sId: data ? data.sId : null,
    isLoading: !error && !data,
    isError: error,
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
    isAgentConfigurationLoading: !error && !data,
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
    isAgentAnayticsLoading: !error && !data && !disabled,
    isAgentAnayticsError: error,
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
    slackChannels: useMemo(() => (data ? data.slackChannels : []), [data]),
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
        description: `${agentConfiguration.name} was successfully deleted.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error deleting ${agentConfiguration.name}`,
        description: `Error: ${errorData.message}`,
      });
    }
    return res.ok;
  };

  return doDelete;
}

export function useUpdateAgentScope({
  owner,
  agentConfigurationId,
}: {
  owner: LightWorkspaceType;
  agentConfigurationId: string | null;
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

  const doUpdate = useCallback(
    async (scope: Exclude<AgentConfigurationScope, "global">) => {
      const body: PostAgentScopeRequestBody = {
        scope,
      };

      try {
        if (!agentConfigurationId) {
          throw new Error(
            "Cannot update scope of a non-existing agent. Action: make sure agentConfigurationId is not null."
          );
        }

        const res = await fetch(
          `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/scope`,
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
            title: `Agent sharing updated.`,
            type: "success",
          });
          await mutateAgentConfigurations();
          await mutateCurrentAgentConfiguration();
          return true;
        } else {
          const data = await res.json();
          sendNotification({
            title: `Error updating agent sharing.`,
            description: data.error.message,
            type: "error",
          });
          return false;
        }
      } catch (error) {
        sendNotification({
          title: `Error updating agent sharing.`,
          description: (error as Error).message || "An unknown error occurred",
          type: "error",
        });
        return false;
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
  return doUpdate;
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
          description: (error as Error).message || "An unknown error occurred",
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
