import React from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import type { SlackChannel } from "@app/components/agent_builder/SlackIntegration";
import { SlackIntegration } from "@app/components/agent_builder/SlackIntegration";

export function SlackTab() {
  const { owner } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();

  const slackChannels = useWatch<
    AgentBuilderFormData,
    "agentSettings.slackChannels"
  >({
    name: "agentSettings.slackChannels",
  });

  const slackProvider = useWatch<
    AgentBuilderFormData,
    "agentSettings.slackProvider"
  >({
    name: "agentSettings.slackProvider",
  });

  const {
    field: { onChange },
  } = useController<AgentBuilderFormData, "agentSettings.slackChannels">({
    name: "agentSettings.slackChannels",
  });

  if (!slackProvider) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No Slack integration configured for this workspace.
        </p>
      </div>
    );
  }

  const slackDataSource = supportedDataSourceViews.find(
    (dsv) => dsv.dataSource.connectorProvider === slackProvider
  )?.dataSource;

  if (!slackDataSource) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Slack data source not found.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 flex flex-col gap-2">
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          Slack Channel Settings
        </span>
        <span className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
          Select channels in which this agent replies by default.
        </span>
      </div>

      <SlackIntegration
        existingSelection={slackChannels}
        onSelectionChange={(slackChannels: SlackChannel[]) => {
          onChange(slackChannels);
        }}
        owner={owner}
        slackDataSource={slackDataSource}
      />
    </div>
  );
}
