import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentsGetViewType,
  AgentUserListStatus,
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useCallback, useContext, useMemo } from "react";
import type { Fetcher } from "swr";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { PostAgentScopeRequestBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/scope";
import type { GetAgentUsageResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/usage";
import type { GetSlackChannelsLinkedWithAgentResponseBody } from "@app/pages/api/w/[wId]/assistant/builder/slack/channels_linked_with_agent";
import type { FetchAssistantTemplatesResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";
import type { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

export function useAssistantTemplates({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const assistantTemplatesFetcher: Fetcher<FetchAssistantTemplatesResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/builder/templates`,
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
  workspaceId,
}: {
  templateId: string | null;
  workspaceId: string;
}) {
  const assistantTemplateFetcher: Fetcher<FetchAssistantTemplateResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    templateId !== null
      ? `/api/w/${workspaceId}/assistant/builder/templates/${templateId}`
      : null,
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
}: {
  workspaceId: string;
  agentsGetView: AgentsGetViewType | null;
  includes?: ("authors" | "usage")[];
  limit?: number;
  sort?: "alphabetical" | "priority";
  disabled?: boolean;
}) {
  const agentConfigurationsFetcher: Fetcher<GetAgentConfigurationsResponseBody> =
    fetcher;

  // Function to generate query parameters.
  function getQueryString() {
    const params = new URLSearchParams();
    if (typeof agentsGetView === "string") {
      params.append("view", agentsGetView);
    } else {
      if (agentsGetView && "conversationId" in agentsGetView) {
        params.append("conversationId", agentsGetView.conversationId);
      }
    }
    if (includes.includes("usage")) {
      params.append("withUsage", "true");
    }
    if (includes.includes("authors")) {
      params.append("withAuthors", "true");
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
  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      agentsGetView
        ? `/api/w/${workspaceId}/assistant/agent_configurations?${queryString}`
        : null,
      agentConfigurationsFetcher,
      { disabled }
    );

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

export function useProgressiveAgentConfigurations({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const {
    agentConfigurations: initialAgentConfigurations,
    isAgentConfigurationsLoading: isInitialAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId,
    agentsGetView: "assistants-search",
    limit: 24,
    includes: ["usage"],
    disabled,
  });

  const {
    agentConfigurations: agentConfigurationsWithAuthors,
    isAgentConfigurationsLoading: isAgentConfigurationsWithAuthorsLoading,
    mutate,
    mutateRegardlessOfQueryParams,
  } = useAgentConfigurations({
    workspaceId,
    agentsGetView: "assistants-search",
    includes: ["authors", "usage"],
  });

  const isLoading =
    isInitialAgentConfigurationsLoading ||
    isAgentConfigurationsWithAuthorsLoading;
  const agentConfigurations = isAgentConfigurationsWithAuthorsLoading
    ? initialAgentConfigurations
    : agentConfigurationsWithAuthors;

  return {
    agentConfigurations,
    isLoading,
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

  const { data, error, mutate } = useSWRWithDefaults(
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
    mutateAgentConfiguration: mutate,
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
    isAgentUsageLoading: !error && !data,
    isAgentUsageError: error,
    mutateAgentUsage: mutate,
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
  agentConfiguration: LightAgentConfigurationType;
}) {
  const sendNotification = useContext(SendNotificationsContext);
  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list", // Anything would work
      disabled: true, // We only use the hook to mutate the cache
    });

  const { mutateAgentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
    disabled: true, // We only use the hook to mutate the cache
  });

  const doDelete = async () => {
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
  const sendNotification = useContext(SendNotificationsContext);
  const { mutateAgentConfiguration: mutateCurrentAgentConfiguration } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId,
      disabled: true,
    });
  const { mutate: mutateAgentConfigurations } =
    useProgressiveAgentConfigurations({
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
            title: `Assistant sharing updated.`,
            type: "success",
          });
          await mutateAgentConfigurations();
          await mutateCurrentAgentConfiguration();
          return true;
        } else {
          const data = await res.json();
          sendNotification({
            title: `Error updating assistant sharing.`,
            description: data.error.message,
            type: "error",
          });
          return false;
        }
      } catch (error) {
        sendNotification({
          title: `Error updating assistant sharing.`,
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

export function useUpdateAgentUserListStatus({
  owner,
  agentConfigurationId,
}: {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
}) {
  const sendNotification = useContext(SendNotificationsContext);
  const { mutateAgentConfiguration: mutateCurrentAgentConfiguration } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId,
      disabled: true,
    });
  const { mutate: mutateAgentConfigurations } =
    useProgressiveAgentConfigurations({
      workspaceId: owner.sId,
      disabled: true,
    });

  const doUpdate = useCallback(
    async (listStatus: AgentUserListStatus) => {
      try {
        const body: PostAgentListStatusRequestBody = {
          agentId: agentConfigurationId,
          listStatus,
        };

        const res = await fetch(
          `/api/w/${owner.sId}/members/me/agent_list_status`,
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
              listStatus === "in-list"
                ? "added to your list"
                : "removed from your list"
            }`,
            type: "success",
          });
          await mutateAgentConfigurations();
          await mutateCurrentAgentConfiguration();
          return true;
        } else {
          const data = await res.json();
          sendNotification({
            title: `Error ${
              listStatus === "in-list" ? "adding" : "removing"
            } Assistant`,
            description: data.error.message,
            type: "error",
          });
          return false;
        }
      } catch (error) {
        sendNotification({
          title: `Error updating assistant list.`,
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
