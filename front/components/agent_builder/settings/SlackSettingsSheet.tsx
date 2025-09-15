import {
  Button,
  Checkbox,
  ContentMessage,
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
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useConnectorPermissions } from "@app/lib/swr/connectors";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { DataSourceType, WorkspaceType } from "@app/types";
import { isAdmin } from "@app/types/user";

const SLACK_CHANNEL_INTERNAL_ID_PREFIX = "slack-channel-";

export type SlackChannel = {
  slackChannelId: string;
  slackChannelName: string;
  sourceUrl?: string | null;
  autoRespondWithoutMention?: boolean;
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
  slackDataSource: DataSourceType;
}

export function SlackSettingsSheet({
  isOpen,
  onOpenChange,
  slackDataSource,
}: SlackSettingsSheetProps) {
  const { owner } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const [localSlackChannels, setLocalSlackChannels] = useState<SlackChannel[]>(
    []
  );
  const [
    autoRespondWithoutMentionEnabled,
    setAutoRespondWithoutMentionEnabled,
  ] = useState(false);

  const {
    field: { onChange, value: slackChannels },
  } = useController<AgentBuilderFormData, "agentSettings.slackChannels">({
    name: "agentSettings.slackChannels",
  });

  useEffect(() => {
    setLocalSlackChannels([...(slackChannels || [])]);
    const currentAutoRespondWithoutMention =
      (slackChannels || [])[0]?.autoRespondWithoutMention || false;
    setAutoRespondWithoutMentionEnabled(currentAutoRespondWithoutMention);
  }, [slackChannels]);

  useEffect(() => {
    if (isOpen) {
      setLocalSlackChannels([...(slackChannels || [])]);
      const currentAutoRespondWithoutMention =
        (slackChannels || [])[0]?.autoRespondWithoutMention || false;
      setAutoRespondWithoutMentionEnabled(currentAutoRespondWithoutMention);
    }
  }, [isOpen, slackChannels]);

  const handleSelectionChange = (channels: SlackChannel[]) => {
    setLocalSlackChannels(channels);
  };

  const onSave = () => {
    const channelsWithAutoRespondWithoutMention = localSlackChannels.map(
      (channel) => ({
        ...channel,
        autoRespondWithoutMention: autoRespondWithoutMentionEnabled,
      })
    );
    onChange(channelsWithAutoRespondWithoutMention);
    onOpenChange();
  };

  const handleClose = () => {
    setLocalSlackChannels([...(slackChannels || [])]);
    const currentAutoRespondWithoutMention =
      (slackChannels || [])[0]?.autoRespondWithoutMention || false;
    setAutoRespondWithoutMentionEnabled(currentAutoRespondWithoutMention);
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

    const channelSelectionChanged = Array.from(currentChannelIds).some(
      (id) => !localChannelIds.has(id as string)
    );

    const currentAutoRespondWithoutMention =
      (slackChannels || [])[0]?.autoRespondWithoutMention || false;
    const autoRespondWithoutMentionChanged =
      autoRespondWithoutMentionEnabled !== currentAutoRespondWithoutMention;

    return channelSelectionChanged || autoRespondWithoutMentionChanged;
  }, [slackChannels, localSlackChannels, autoRespondWithoutMentionEnabled]);

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
          <div className="flex flex-col gap-4">
            <div className="text-sm font-normal text-foreground dark:text-foreground-night">
              Set this agent as the default agent on one or several of your
              Slack channels. It will answer by default when the{" "}
              <span className="font-bold">@Dust</span> Slack bot is mentioned in
              these channels.
            </div>
            {!isAdmin(owner) && (
              <ContentMessage
                size="md"
                variant="warning"
                title="Admin Access Required"
                icon={InformationCircleIcon}
              >
                <p>
                  Only administrators can enable default agents for specific
                  Slack channels.
                </p>
              </ContentMessage>
            )}

            {isAdmin(owner) && (
              <SlackChannelsList
                existingSelection={localSlackChannels}
                onSelectionChange={handleSelectionChange}
                owner={owner}
                slackDataSource={slackDataSource}
              />
            )}
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
        >
          {hasFeature("slack_enhanced_default_agent") && isAdmin(owner) && (
            <div className="flex flex-col border-t p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                    Enhanced Default Agent
                  </span>
                  <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                    Agent will automatically respond to all messages and thread
                    replies in selected channels (not just @mentions)
                  </span>
                </div>
                <div className="flex-shrink-0">
                  <SliderToggle
                    selected={autoRespondWithoutMentionEnabled}
                    onClick={() =>
                      setAutoRespondWithoutMentionEnabled(
                        !autoRespondWithoutMentionEnabled
                      )
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
