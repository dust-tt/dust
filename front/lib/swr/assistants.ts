import type {
  AgentConfigurationType,
  AgentsGetViewType,
  APIError,
  DataSourceType,
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useContext, useMemo } from "react";
import type { Fetcher } from "swr";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { GetAgentUsageResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/usage";
import type { FetchAssistantTemplatesResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";
import type { GetSlackChannelsLinkedWithAgentResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/slack/channels_linked_with_agent";

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
}: {
  workspaceId: string;
}) {
  const {
    agentConfigurations: initialAgentConfigurations,
    isAgentConfigurationsLoading: isInitialAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId,
    agentsGetView: "assistants-search",
    limit: 24,
    includes: ["usage"],
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
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
}) {
  const agentUsageFetcher: Fetcher<GetAgentUsageResponseBody> = fetcher;
  const fetchUrl = agentConfigurationId
    ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/usage`
    : null;
  const { data, error, mutate } = useSWRWithDefaults(
    fetchUrl,
    agentUsageFetcher
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
  dataSource,
  disabled,
}: {
  workspaceId: string;
  dataSource?: DataSourceType;
  disabled?: boolean;
}) {
  const slackChannelsLinkedWithAgentFetcher: Fetcher<GetSlackChannelsLinkedWithAgentResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/data_sources/${dataSource?.sId}/managed/slack/channels_linked_with_agent`,
    slackChannelsLinkedWithAgentFetcher,
    {
      disabled: !!disabled || !dataSource,
    }
  );

  return {
    slackChannels: useMemo(() => (data ? data.slackChannels : []), [data]),
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
      const err: { error: APIError } = await res.json();
      sendNotification({
        type: "error",
        title: `Error deleting ${agentConfiguration.name}`,
        description: `Error: ${err.error.message}`,
      });
    }
    return res.ok;
  };

  return doDelete;
}
