import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { useSendNotification } from "@app/hooks/useNotification";
import type {
  AgentMessageFeedbackType,
  AgentMessageFeedbackWithMetadataType,
} from "@app/lib/api/assistant/feedback";
import type { GetVersionMarkersResponse } from "@app/lib/api/assistant/observability/version_markers";
import { clientFetch } from "@app/lib/egress/client";
import type {
  FetchAgentTemplateResponse,
  FetchAssistantTemplatesResponse,
} from "@app/lib/resources/template_resource";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetAgentUsageResponseBody } from "@app/types/api/assistant/agent_usage";
import type { GetSlackChannelsLinkedWithAgentResponseBody } from "@app/types/api/assistant/builder/slack/channels_linked_with_agent";
import type { GetSlackUserPrivateChannelsResponseBody } from "@app/types/api/assistant/builder/slack/user_private_channels";
import type { GetAgentConfigurationsResponseBody } from "@app/types/api/assistant/configuration";
import {
  ArchiveInactiveAgentsResponseBodySchema,
  BatchUpdateAgentModelResponseBodySchema,
  PreviewInactiveAgentsResponseBodySchema,
} from "@app/types/api/assistant/configuration";
import type { GetSimilarAgentsResponseBody } from "@app/types/api/assistant/configuration/existing_agent_checker";
import type { GetAgentFeedbackDistributionResponseBody } from "@app/types/api/assistant/observability/feedback-distribution";
import type { GetAgentOverviewResponseBody } from "@app/types/api/assistant/observability/overview";
import type { PostAgentUserFavoriteRequestBody } from "@app/types/api/assistant/user_relation";
import type { GetMemberResponseBody } from "@app/types/api/user";
import type {
  AgentConfigurationType,
  AgentsGetViewType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo, useState } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

export function useAssistantTemplates() {
  const { fetcher } = useFetcher();
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
  const { fetcher } = useFetcher();
  const assistantTemplateFetcher: Fetcher<FetchAgentTemplateResponse> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    templateId !== null ? `/api/templates/${templateId}` : null,
    assistantTemplateFetcher
  );

  return {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  const { fetcher } = useFetcher();
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

export function useSimilarAgents({ owner }: { owner: LightWorkspaceType }) {
  const { fetcher } = useFetcher();
  const getSimilarAgents = useCallback(
    async (
      naturalDescription: string,
      options: { signal?: AbortSignal } = {}
    ) => {
      const response: GetSimilarAgentsResponseBody = await fetcher(
        `/api/w/${owner.sId}/assistant/agent_configurations/similar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ naturalDescription }),
          signal: options?.signal,
        }
      );
      return new Ok(response.similar_agents);
    },
    [owner.sId, fetcher]
  );

  return { getSimilarAgents };
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

export function useAccessibleAgentIds({
  workspaceId,
}: {
  workspaceId: string;
}): Set<string> {
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId,
  });
  return useMemo(
    () => new Set(agentConfigurations.map((a) => a.sId)),
    [agentConfigurations]
  );
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
  const { fetcher } = useFetcher();
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
  filter?: "unseen" | "all";
  version?: number;
  days?: number;
}

export function useAgentConfigurationFeedbacksByDescVersion({
  workspaceId,
  agentConfigurationId,
  limit,
  filter = "unseen",
  version,
  days,
}: AgentConfigurationFeedbacksByDescVersionProps) {
  const { fetcher } = useFetcher();
  const agentConfigurationFeedbacksFetcher: Fetcher<{
    feedbacks: (
      | AgentMessageFeedbackType
      | AgentMessageFeedbackWithMetadataType
    )[];
  }> = fetcher;

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

        // Build URLSearchParams fresh for each page to avoid param accumulation.
        const urlParams = new URLSearchParams({
          limit: limit.toString(),
          orderColumn: "id",
          orderDirection: "desc",
          withMetadata: "true",
          filter,
        });

        if (version !== undefined) {
          urlParams.set("version", version.toString());
        }

        if (days !== undefined) {
          urlParams.set("days", days.toString());
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
  const { fetcher } = useFetcher();
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

export function useAgentUsage({
  workspaceId,
  agentConfigurationId,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
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
  version,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  period: number;
  version?: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const agentAnalyticsFetcher: Fetcher<GetAgentOverviewResponseBody> = fetcher;
  const fetchUrl = agentConfigurationId
    ? (() => {
        const params = new URLSearchParams({ days: String(period) });
        if (version) {
          params.set("version", version);
        }
        return `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/observability/overview?${params.toString()}`;
      })()
    : null;
  const { data, error } = useSWRWithDefaults(fetchUrl, agentAnalyticsFetcher, {
    disabled,
  });

  return {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  const { fetcher } = useFetcher();
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

export function useSlackUserPrivateChannels({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const userPrivateChannelsFetcher: Fetcher<GetSlackUserPrivateChannelsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/builder/slack/user_private_channels`,
    userPrivateChannelsFetcher,
    {
      disabled: !!disabled,
    }
  );

  return {
    status: data?.status ?? null,
    privateChannels: data?.channels ?? emptyArray(),
    isPrivateChannelsLoading: !disabled && !error && !data,
    isPrivateChannelsError: error,
    mutatePrivateChannels: mutate,
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
    const res = await clientFetch(
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
    const res = await clientFetch(
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

        const res = await clientFetch(
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
            title: `Agent ${
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
            title: `Error ${userFavorite ? "adding" : "removing"} Agent`,
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
    const res = await clientFetch(
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
      await clientFetch(
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

export function useBatchUpdateAgentModel({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const batchUpdateAgentModel = useCallback(
    async (
      agentIds: string[],
      body: {
        modelId: string;
        reasoningEffort?: ReasoningEffort;
        responseFormat?: string;
      }
    ) => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/batch_update_model`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...body,
            agentIds,
          }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          type: "error",
          title: "Error updating model",
          description: `Error: ${errorData.message}`,
        });
        return false;
      }

      // Each agent is saved on its own, so some of them may have been skipped.
      const json = await res.json();
      const parsed = BatchUpdateAgentModelResponseBodySchema.safeParse(json);
      if (!parsed.success) {
        sendNotification({
          type: "error",
          title: "Error updating model",
          description: "An unknown error occurred.",
        });
        return true;
      }

      const { updatedAgentIds, skippedAgentIds } = parsed.data;

      sendNotification({
        type: skippedAgentIds.length > 0 ? "info" : "success",
        title: "Model updated",
        description:
          skippedAgentIds.length > 0
            ? `Model updated on ${updatedAgentIds.length} agent${pluralize(updatedAgentIds.length)}, ` +
              `${skippedAgentIds.length} could not be updated.`
            : `Model updated on ${updatedAgentIds.length} agent${pluralize(updatedAgentIds.length)}.`,
      });
      return true;
    },
    [owner.sId, sendNotification]
  );

  return batchUpdateAgentModel;
}

export function useBatchUpdateAgentScope({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const batchUpdateAgentScope = useCallback(
    async (agentIds: string[], body: { scope: "visible" | "hidden" }) => {
      await clientFetch(
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

export function useUpdateInactiveAgentArchival({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  // Null turns it off: the policy is opt-in and has no default threshold.
  const updateInactiveAgentArchival = useCallback(
    async (thresholdDays: number | null) => {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inactiveAgentArchivalThresholdDays: thresholdDays,
        }),
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          type: "error",
          title: "Error updating automatic archival",
          description: `Error: ${errorData.message}`,
        });
        return false;
      }

      sendNotification({
        type: "success",
        title: thresholdDays
          ? "Automatic archival enabled"
          : "Automatic archival disabled",
        description: thresholdDays
          ? `Agents unmentioned for ${thresholdDays} days will be archived.`
          : "No agent will be archived automatically.",
      });
      return true;
    },
    [owner.sId, sendNotification]
  );

  return updateInactiveAgentArchival;
}

export function usePreviewInactiveAgents({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const previewInactiveAgents = useCallback(
    async (thresholdDays: number) => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/archive_inactive/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ thresholdDays }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          type: "error",
          title: "Error previewing inactive agents",
          description: `Error: ${errorData.message}`,
        });
        return null;
      }

      const parsed = PreviewInactiveAgentsResponseBodySchema.safeParse(
        await res.json()
      );
      if (!parsed.success) {
        sendNotification({
          type: "error",
          title: "Error previewing inactive agents",
          description: "An unknown error occurred.",
        });
        return null;
      }

      return parsed.data.preview;
    },
    [owner.sId, sendNotification]
  );

  return previewInactiveAgents;
}

export function useArchiveInactiveAgents({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const archiveInactiveAgents = useCallback(
    async (thresholdDays: number) => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/archive_inactive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ thresholdDays }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          type: "error",
          title: "Error archiving inactive agents",
          description: `Error: ${errorData.message}`,
        });
        return null;
      }

      const parsed = ArchiveInactiveAgentsResponseBodySchema.safeParse(
        await res.json()
      );
      if (!parsed.success) {
        sendNotification({
          type: "error",
          title: "Error archiving inactive agents",
          description: "An unknown error occurred.",
        });
        return null;
      }

      const { archivedCount } = parsed.data.archival;
      sendNotification({
        type: "success",
        title: "Inactive agents archived",
        description: `Archived ${archivedCount} agent${pluralize(archivedCount)}.`,
      });

      return { archivedCount };
    },
    [owner.sId, sendNotification]
  );

  return archiveInactiveAgents;
}

export function useAgentFeedbackDistribution({
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
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetAgentFeedbackDistributionResponseBody> = fetcher;
  const key = `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/observability/feedback-distribution?days=${days}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    feedbackDistribution: data?.points ?? emptyArray(),
    isFeedbackDistributionLoading: !error && !data && !disabled,
    isFeedbackDistributionError: error,
    isFeedbackDistributionValidating: isValidating,
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
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<GetVersionMarkersResponse> = fetcher;
  const key = `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/observability/version-markers?days=${days}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    versionMarkers: data?.versionMarkers ?? emptyArray(),
    isVersionMarkersLoading: !error && !data && !disabled,
    isVersionMarkersError: error,
    isVersionMarkersValidating: isValidating,
  };
}

export type MemberDisplayInfo = {
  fullName: string;
  email: string | null;
  image: string | null;
};

function buildMemberDetailsSwrKey(
  workspaceId: string,
  userIds: string[]
): string | null {
  const normalizedUserIds = [...new Set(userIds.filter(Boolean))].sort();
  if (normalizedUserIds.length === 0) {
    return null;
  }
  if (normalizedUserIds.length === 1) {
    return `/api/w/${workspaceId}/members/${normalizedUserIds[0]}`;
  }
  const sIdsKey = normalizedUserIds.join(",");
  return `/api/w/${workspaceId}/members/batch?sIds=${encodeURIComponent(sIdsKey)}`;
}

export function useMemberDetails({
  workspaceId,
  userIds,
}: {
  workspaceId: string;
  userIds: string[];
}) {
  const { fetcher } = useFetcher();
  const normalizedUserIds = useMemo(
    () => [...new Set(userIds.filter(Boolean))].sort(),
    [userIds]
  );
  const swrKey = useMemo(
    () => buildMemberDetailsSwrKey(workspaceId, normalizedUserIds),
    [workspaceId, normalizedUserIds]
  );

  const memberDetailsFetcher = useCallback(
    async (
      key: string
    ): Promise<
      | { kind: "single"; member: GetMemberResponseBody["member"] }
      | { kind: "batch"; membersBySId: Record<string, MemberDisplayInfo> }
    > => {
      if (key.includes("/members/batch?")) {
        const url = new URL(key, "https://dust.local");
        const sIdsParam = url.searchParams.get("sIds");
        if (!sIdsParam) {
          return { kind: "batch", membersBySId: {} };
        }

        const membersBySId: Record<string, MemberDisplayInfo> = {};
        for (const memberSId of sIdsParam.split(",")) {
          try {
            const response = (await fetcher(
              `/api/w/${workspaceId}/members/${memberSId}`
            )) as GetMemberResponseBody;

            membersBySId[memberSId] = {
              fullName: response.member.fullName,
              email: response.member.email,
              image: response.member.image,
            };
          } catch {
            // Member lookup can fail for privacy or membership reasons.
          }
        }

        return { kind: "batch", membersBySId };
      }

      const response = (await fetcher(key)) as GetMemberResponseBody;
      return { kind: "single", member: response.member };
    },
    [fetcher, workspaceId]
  );

  const { data, error, mutate, isValidating, isLoading } = useSWRWithDefaults(
    swrKey,
    memberDetailsFetcher
  );

  const userDetails = data?.kind === "single" ? data.member : undefined;
  const membersBySId =
    data?.kind === "batch"
      ? data.membersBySId
      : userDetails
        ? {
            [userDetails.id]: {
              fullName: userDetails.fullName,
              email: userDetails.email,
              image: userDetails.image,
            },
          }
        : {};

  return {
    userDetails,
    membersBySId,
    isMembersLoading: !error && isLoading && !!swrKey,
    isMembersError: error,
    isMembersValidating: isValidating,
    mutateMembers: mutate,
  };
}
