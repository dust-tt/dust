import {
  Button,
  Checkbox,
  ExternalLinkIcon,
  Icon,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SlackLogo,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useConnectorPermissions } from "@app/lib/swr/connectors";
import type { DataSourceType, WorkspaceType } from "@app/types";

const SLACK_CHANNEL_INTERNAL_ID_PREFIX = "slack-channel-";

export type SlackChannel = {
  slackChannelId: string;
  slackChannelName: string;
  sourceUrl?: string | null;
};

interface SlackChannelsListProps {
  existingSelection: SlackChannel[];
  onSelectionChange: (channels: SlackChannel[]) => void;
  owner: WorkspaceType;
  slackDataSource: DataSourceType;
}

function SlackChannelsList({
  existingSelection,
  onSelectionChange,
  owner,
  slackDataSource,
}: SlackChannelsListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions({
      dataSource: slackDataSource,
      filterPermission: "write",
      owner,
      parentId: null,
      viewType: "all",
    });

  const filteredChannels = useMemo(() => {
    if (!resources) {
      return [];
    }

    return resources
      .filter((resource) =>
        resource.internalId.startsWith(SLACK_CHANNEL_INTERNAL_ID_PREFIX)
      )
      .map((resource) => ({
        slackChannelId: resource.internalId.substring(
          SLACK_CHANNEL_INTERNAL_ID_PREFIX.length
        ),
        slackChannelName: resource.title,
        sourceUrl: resource.sourceUrl,
      }))
      .filter(
        (channel) =>
          searchQuery.trim() === "" ||
          channel.slackChannelName
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      );
  }, [resources, searchQuery]);

  const handleChannelToggle = useCallback(
    (channel: SlackChannel, isChecked?: boolean) => {
      const currentlySelected = existingSelection.some(
        (c) => c.slackChannelId === channel.slackChannelId
      );
      const shouldSelect = isChecked ?? !currentlySelected;

      if (shouldSelect) {
        const channelForSelection: SlackChannel = {
          slackChannelId: channel.slackChannelId,
          slackChannelName: channel.slackChannelName,
          sourceUrl: channel.sourceUrl,
        };
        onSelectionChange([...existingSelection, channelForSelection]);
      } else {
        onSelectionChange(
          existingSelection.filter(
            (c) => c.slackChannelId !== channel.slackChannelId
          )
        );
      }
    },
    [existingSelection, onSelectionChange]
  );

  const isChannelSelected = useCallback(
    (channel: SlackChannel) =>
      existingSelection.some(
        (c) => c.slackChannelId === channel.slackChannelId
      ),
    [existingSelection]
  );

  if (isResourcesError) {
    return (
      <div className="text-sm text-warning">
        Failed to retrieve Slack channels. Please check your Slack integration.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SearchInput
        name="slack-channel-search"
        placeholder="Search channels..."
        value={searchQuery}
        onChange={setSearchQuery}
      />

      {isResourcesLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="overflow-y-auto">
          {filteredChannels.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
              {searchQuery.trim() === ""
                ? "No channels available"
                : `No channels match "${searchQuery}"`}
            </div>
          ) : (
            filteredChannels.map((channel) => (
              <div
                key={channel.slackChannelId}
                className="group flex cursor-pointer items-center justify-between rounded-lg p-2"
                onClick={() => handleChannelToggle(channel)}
              >
                <div className="flex items-center space-x-3">
                  <Checkbox
                    checked={isChannelSelected(channel)}
                    onCheckedChange={(checked) =>
                      handleChannelToggle(channel, checked === true)
                    }
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    size="xs"
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {channel.slackChannelName}
                  </span>
                </div>
                {channel.sourceUrl && (
                  <div className="opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      href={channel.sourceUrl}
                      icon={ExternalLinkIcon}
                      size="xs"
                      variant="outline"
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface SlackSettingsSheetProps {
  isOpen: boolean;
  onOpenChange: () => void;
}

export function SlackSettingsSheet({
  isOpen,
  onOpenChange,
}: SlackSettingsSheetProps) {
  const { owner } = useAgentBuilderContext();
  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const [localSlackChannels, setLocalSlackChannels] = useState<SlackChannel[]>(
    []
  );

  const {
    field: { onChange, value: slackChannels },
  } = useController<AgentBuilderFormData, "agentSettings.slackChannels">({
    name: "agentSettings.slackChannels",
  });

  const {
    field: { value: slackProvider },
  } = useController<AgentBuilderFormData, "agentSettings.slackProvider">({
    name: "agentSettings.slackProvider",
  });

  useEffect(() => {
    setLocalSlackChannels([...(slackChannels || [])]);
  }, [slackChannels]);

  useEffect(() => {
    if (isOpen) {
      setLocalSlackChannels([...(slackChannels || [])]);
    }
  }, [isOpen, slackChannels]);

  const handleSelectionChange = (channels: SlackChannel[]) => {
    setLocalSlackChannels(channels);
  };

  const onSave = () => {
    onChange(localSlackChannels);
    onOpenChange();
  };

  const handleClose = () => {
    setLocalSlackChannels([...(slackChannels || [])]);
    onOpenChange();
  };

  const hasUnsavedChanges = useMemo(() => {
    const currentChannelIds = new Set(
      (slackChannels || []).map((c) => c.slackChannelId)
    );
    const localChannelIds = new Set(
      localSlackChannels.map((c) => c.slackChannelId)
    );

    if (currentChannelIds.size !== localChannelIds.size) {
      return true;
    }

    return Array.from(currentChannelIds).some((id) => !localChannelIds.has(id));
  }, [slackChannels, localSlackChannels]);

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
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            <div className="flex items-center gap-2">
              <Icon visual={SlackLogo} />
              <span>Slack Channel Settings</span>
            </div>
          </SheetTitle>
          <SheetDescription>
            Select channels in which this agent replies by default.
          </SheetDescription>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-2">
            <div className="text-sm font-normal text-foreground dark:text-foreground-night">
              Set this agent as the default agent on one or several of your
              Slack channels. It will answer by default when the{" "}
              <span className="font-bold">@Dust</span> Slack bot is mentionned
              in these channels.
            </div>
            <SlackChannelsList
              existingSelection={localSlackChannels}
              onSelectionChange={handleSelectionChange}
              owner={owner}
              slackDataSource={slackDataSource}
            />
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Close",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: onSave,
            disabled: !hasUnsavedChanges,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
