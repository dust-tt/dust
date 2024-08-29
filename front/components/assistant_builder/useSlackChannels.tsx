import type { DataSourceViewType } from "@dust-tt/types";
import { useEffect, useState } from "react";

import type { SlackChannel } from "@app/components/assistant_builder/SlackIntegration";
import { useSlackChannelsLinkedWithAgent } from "@app/lib/swr";

interface useSlackChannelProps {
  agentConfigurationId: string | null;
  dataSourceViews: DataSourceViewType[];
  initialChannels: SlackChannel[];
  isBuilder: boolean;
  isEdited: boolean;
  isPrivateAssistant: boolean;
  workspaceId: string;
}

export function useSlackChannel({
  agentConfigurationId,
  dataSourceViews,
  initialChannels,
  isBuilder,
  isEdited,
  isPrivateAssistant,
  workspaceId,
}: useSlackChannelProps) {
  // This state stores the slack channels that should have the current agent as default.
  const [selectedSlackChannels, setSelectedSlackChannels] =
    useState<SlackChannel[]>(initialChannels);
  const [slackChannelsInitialized, setSlackChannelsInitialized] =
    useState(false);

  const slackDataSource = dataSourceViews.find(
    (ds) => ds.dataSource.connectorProvider === "slack"
  );

  // Retrieve all the slack channels that are linked with an agent.
  const { slackChannels: slackChannelsLinkedWithAgent } =
    useSlackChannelsLinkedWithAgent({
      workspaceId,
      dataSourceName: slackDataSource?.dataSource.name ?? undefined,
      disabled: !isBuilder,
    });

  // This effect is used to initially set the selectedSlackChannels state using the data retrieved from the API.
  useEffect(() => {
    if (
      slackChannelsLinkedWithAgent.length &&
      agentConfigurationId &&
      !isEdited &&
      !slackChannelsInitialized
    ) {
      setSelectedSlackChannels(
        slackChannelsLinkedWithAgent
          .filter(
            (channel) => channel.agentConfigurationId === agentConfigurationId
          )
          .map((channel) => ({
            slackChannelId: channel.slackChannelId,
            slackChannelName: channel.slackChannelName,
          }))
      );
      setSlackChannelsInitialized(true);
    }
  }, [
    slackChannelsLinkedWithAgent,
    agentConfigurationId,
    isEdited,
    slackChannelsInitialized,
  ]);

  return {
    showSlackIntegration: !isPrivateAssistant,
    selectedSlackChannels,
    slackChannelsLinkedWithAgent,
    setSelectedSlackChannels,
  };
}
