import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useConnectorPermissions } from "@app/lib/swr/connectors";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Button,
  Checkbox,
  ContentMessage,
  Icon,
  LinkExternal01,
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
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useController } from "react-hook-form";

const SLACK_CHANNEL_INTERNAL_ID_PREFIX = "slack-channel-";

type SlackChannel = {
  slackChannelId: string;
  slackChannelName: string;
  sourceUrl?: string | null;
  autoRespondWithoutMention?: boolean;
  autoRespondWithoutMentionSkipThreadReplies?: boolean;
};

type LocalState = {
  localSlackChannels: SlackChannel[];
  autoRespondWithoutMentionEnabled: boolean;
  skipThreadRepliesEnabled: boolean;
};

function stateFromChannels(channels: SlackChannel[] | undefined): LocalState {
  const ch = channels ?? [];
  return {
    localSlackChannels: [...ch],
    autoRespondWithoutMentionEnabled: ch[0]?.autoRespondWithoutMention ?? false,
    skipThreadRepliesEnabled:
      ch[0]?.autoRespondWithoutMentionSkipThreadReplies ?? false,
  };
}

interface SlackChannelsListProps {
  disabled?: boolean;
  existingSelection: SlackChannel[];
  onSelectionChange: (channels: SlackChannel[]) => void;
  owner: WorkspaceType;
  slackDataSource: DataSourceType;
}

function SlackChannelsList({
  disabled,
  existingSelection,
  onSelectionChange,
  owner,
  slackDataSource,
}: SlackChannelsListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions({
      dataSource: slackDataSource,
      disabled,
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
            <div className="py-4 text-center text-sm text-muted-foreground">
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
                  />
                  <span className="text-sm font-medium text-primary-900">
                    {channel.slackChannelName}
                  </span>
                </div>
                {channel.sourceUrl && (
                  <div className="opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      href={channel.sourceUrl}
                      icon={LinkExternal01}
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
  const { hasFeature } = useFeatureFlags();

  const {
    field: { onChange, value: slackChannels },
  } = useController<AgentBuilderFormData, "agentSettings.slackChannels">({
    name: "agentSettings.slackChannels",
  });

  const [
    {
      localSlackChannels,
      autoRespondWithoutMentionEnabled,
      skipThreadRepliesEnabled,
    },
    setLocalState,
  ] = useState<LocalState>(() => stateFromChannels(slackChannels));

  useEffect(() => {
    setLocalState(stateFromChannels(slackChannels));
  }, [slackChannels]);

  useEffect(() => {
    if (isOpen) {
      setLocalState(stateFromChannels(slackChannels));
    }
  }, [isOpen, slackChannels]);

  const handleSelectionChange = (channels: SlackChannel[]) => {
    setLocalState((prev) => ({ ...prev, localSlackChannels: channels }));
  };

  const onSave = () => {
    const channelsWithSettings = localSlackChannels.map((channel) => ({
      ...channel,
      autoRespondWithoutMention: autoRespondWithoutMentionEnabled,
      autoRespondWithoutMentionSkipThreadReplies:
        autoRespondWithoutMentionEnabled ? skipThreadRepliesEnabled : false,
    }));
    onChange(channelsWithSettings);
    onOpenChange();
  };

  const handleClose = () => {
    setLocalState(stateFromChannels(slackChannels));
    onOpenChange();
  };

  const hasUnsavedChanges = useMemo(() => {
    const currentChannelIds = new Set(
      (slackChannels ?? []).map((c) => c.slackChannelId)
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

    const savedAutoRespond =
      (slackChannels ?? [])[0]?.autoRespondWithoutMention ?? false;
    const savedSkipThreadReplies =
      (slackChannels ?? [])[0]?.autoRespondWithoutMentionSkipThreadReplies ??
      false;

    return (
      channelSelectionChanged ||
      autoRespondWithoutMentionEnabled !== savedAutoRespond ||
      skipThreadRepliesEnabled !== savedSkipThreadReplies
    );
  }, [
    slackChannels,
    localSlackChannels,
    autoRespondWithoutMentionEnabled,
    skipThreadRepliesEnabled,
  ]);

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
            <div className="text-sm font-normal text-foreground">
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
                disabled={!isOpen}
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
            <div className="flex flex-col gap-3 border-t p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    Respond to all messages in channel
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Agent will automatically respond to messages in selected
                    channels (not just @mentions)
                  </span>
                </div>
                <SliderToggle
                  selected={autoRespondWithoutMentionEnabled}
                  onClick={() =>
                    setLocalState((prev) => ({
                      ...prev,
                      autoRespondWithoutMentionEnabled:
                        !prev.autoRespondWithoutMentionEnabled,
                      skipThreadRepliesEnabled:
                        prev.autoRespondWithoutMentionEnabled
                          ? false
                          : prev.skipThreadRepliesEnabled,
                    }))
                  }
                />
              </div>
              {autoRespondWithoutMentionEnabled && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">
                      Top-level posts only
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Only respond to new channel messages, not replies within
                      threads
                    </span>
                  </div>
                  <SliderToggle
                    selected={skipThreadRepliesEnabled}
                    onClick={() =>
                      setLocalState((prev) => ({
                        ...prev,
                        skipThreadRepliesEnabled:
                          !prev.skipThreadRepliesEnabled,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
