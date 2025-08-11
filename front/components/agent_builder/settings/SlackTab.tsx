import React, { useCallback, useEffect, useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import type { ContentNodeTreeItemStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useConnectorPermissions } from "@app/lib/swr/connectors";
import type { ContentNode, DataSourceType, WorkspaceType } from "@app/types";

export type SlackChannel = { slackChannelId: string; slackChannelName: string };

const getUseResourceHook =
  (owner: WorkspaceType, slackDataSource: DataSourceType) =>
  (parentId: string | null) =>
    useConnectorPermissions({
      dataSource: slackDataSource,
      filterPermission: "write",
      owner,
      parentId,
      viewType: "all",
    });

interface SlackIntegrationProps {
  existingSelection: SlackChannel[];
  onSelectionChange: (channels: SlackChannel[]) => void;
  owner: WorkspaceType;
  slackDataSource: DataSourceType;
}

function SlackIntegration({
  existingSelection,
  onSelectionChange,
  owner,
  slackDataSource,
}: SlackIntegrationProps) {
  const [newSelection, setNewSelection] = useState<SlackChannel[]>([]);
  useEffect(() => {
    if (existingSelection.length > 0) {
      setNewSelection(existingSelection);
    }
  }, [existingSelection]);

  const customIsNodeChecked = useCallback(
    (node: ContentNode) => {
      const channelId = node.internalId.substring("slack-channel-".length);
      return newSelection?.some((c) => c.slackChannelId === channelId) || false;
    },
    [newSelection]
  );

  // Notify parent component when newSelection changes.
  useEffect(() => {
    if (newSelection !== null) {
      onSelectionChange(newSelection);
    }
  }, [newSelection, onSelectionChange]);

  const useResourcesHook = useCallback(
    (parentId: string | null) =>
      getUseResourceHook(owner, slackDataSource)(parentId),
    [owner, slackDataSource]
  );

  const { resources } = useResourcesHook(null);
  const selectedNodes = resources.reduce(
    (acc, c) =>
      customIsNodeChecked(c)
        ? {
            ...acc,
            [c.internalId]: {
              node: c,
              isSelected: true,
              parents: [],
            },
          }
        : acc,
    {} as Record<string, ContentNodeTreeItemStatus>
  );

  return (
    <ContentNodeTree
      selectedNodes={selectedNodes}
      setSelectedNodes={(updater) => {
        const newModel = updater(selectedNodes);

        setNewSelection((prevSelection) => {
          const newSelection = [...prevSelection];
          Object.values(newModel).forEach((item) => {
            const { isSelected, node } = item;
            const index = newSelection.findIndex(
              (c) => `slack-channel-${c.slackChannelId}` === node.internalId
            );

            if (isSelected && index === -1) {
              newSelection.push({
                slackChannelId: node.internalId.substring(
                  "slack-channel-".length
                ),
                slackChannelName: node.title,
              });
            }

            if (!isSelected && index !== -1) {
              newSelection.splice(index, 1);
            }
          });
          return newSelection;
        });
      }}
      showExpand={false}
      useResourcesHook={useResourcesHook}
    />
  );
}

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
