import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useSlackUserPrivateChannels } from "@app/lib/swr/assistants";
import { useConnectorPermissions } from "@app/lib/swr/connectors";
import {
  useCreatePersonalConnection,
  useMCPServer,
} from "@app/lib/swr/mcp_servers";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Button,
  Checkbox,
  ContentMessage,
  Icon,
  LinkExternal01,
  Lock01,
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
  isPrivate?: boolean;
};

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
  const [isConnectingPersonalSlack, setIsConnectingPersonalSlack] =
    useState(false);
  const sendNotification = useSendNotification();
  const { createPersonalConnection } = useCreatePersonalConnection(owner);

  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions({
      dataSource: slackDataSource,
      disabled,
      filterPermission: "write",
      owner,
      parentId: null,
      viewType: "all",
    });

  const {
    status: privateChannelsStatus,
    privateChannels,
    mcpServerId,
    isPrivateChannelsLoading,
    mutatePrivateChannels,
  } = useSlackUserPrivateChannels({
    workspaceId: owner.sId,
    disabled,
  });

  const { server: slackMcpServer } = useMCPServer({
    owner,
    serverId: mcpServerId ?? "",
    disabled: !mcpServerId || privateChannelsStatus !== "not_connected",
  });

  const publicChannels = useMemo(() => {
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
        isPrivate: false as const,
      }));
  }, [resources]);

  const mergedChannels = useMemo(() => {
    const byId = new Map<string, SlackChannel>();

    for (const channel of publicChannels) {
      byId.set(channel.slackChannelId, channel);
    }

    for (const channel of privateChannels) {
      // Prefer the private-channel entry so admins see the lock affordance.
      byId.set(channel.slackChannelId, {
        slackChannelId: channel.slackChannelId,
        slackChannelName: channel.slackChannelName,
        sourceUrl: channel.sourceUrl,
        isPrivate: true,
      });
    }

    return Array.from(byId.values()).sort((a, b) =>
      a.slackChannelName.localeCompare(b.slackChannelName)
    );
  }, [publicChannels, privateChannels]);

  const filteredChannels = useMemo(() => {
    if (searchQuery.trim() === "") {
      return mergedChannels;
    }
    const query = searchQuery.toLowerCase();
    return mergedChannels.filter((channel) =>
      channel.slackChannelName.toLowerCase().includes(query)
    );
  }, [mergedChannels, searchQuery]);

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
          isPrivate: channel.isPrivate,
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

  const handleConnectPersonalSlack = useCallback(async () => {
    if (!mcpServerId || !slackMcpServer?.authorization) {
      sendNotification({
        type: "error",
        title: "Slack Tools unavailable",
        description:
          "Activate Slack Tools in your workspace and try again, or ask an admin.",
      });
      return;
    }

    setIsConnectingPersonalSlack(true);
    try {
      const result = await createPersonalConnection({
        mcpServerId,
        mcpServerDisplayName: "Slack",
        authorization: slackMcpServer.authorization,
        provider: "slack_tools",
        useCase: "personal_actions",
      });

      if (!result.success) {
        sendNotification({
          type: "error",
          title: "Failed to connect Slack",
          description:
            result.error ?? "Could not connect your Slack account. Try again.",
        });
        return;
      }

      await mutatePrivateChannels();
      sendNotification({
        type: "success",
        title: "Slack connected",
        description:
          "Private channels you belong to can now appear in this list.",
      });
    } finally {
      setIsConnectingPersonalSlack(false);
    }
  }, [
    createPersonalConnection,
    mcpServerId,
    mutatePrivateChannels,
    sendNotification,
    slackMcpServer?.authorization,
  ]);

  if (isResourcesError) {
    return (
      <div className="text-sm text-warning">
        Failed to retrieve Slack channels. Please check your Slack integration.
      </div>
    );
  }

  const isLoading = isResourcesLoading || isPrivateChannelsLoading;

  return (
    <div className="space-y-4">
      {privateChannelsStatus === "not_connected" && (
        <ContentMessage
          size="md"
          variant="info"
          title="Show private channels"
          icon={Lock01}
        >
          <div className="flex flex-col gap-3">
            <p>
              Connect your personal Slack account to list private channels you
              are a member of (and where the Dust app is present). This stays
              scoped to you — other admins will not see your private channels.
            </p>
            <div>
              <Button
                label={
                  isConnectingPersonalSlack
                    ? "Connecting..."
                    : "Connect Slack account"
                }
                variant="outline"
                size="sm"
                icon={SlackLogo}
                disabled={isConnectingPersonalSlack || !mcpServerId}
                onClick={() => {
                  void handleConnectPersonalSlack();
                }}
              />
            </div>
          </div>
        </ContentMessage>
      )}

      {privateChannelsStatus === "tool_unavailable" && (
        <ContentMessage
          size="md"
          variant="warning"
          title="Private channels unavailable"
          icon={InformationCircleIcon}
        >
          <p>
            Activate the Slack Tools integration in your workspace to list
            private channels you belong to.
          </p>
        </ContentMessage>
      )}

      {privateChannelsStatus === "ok" && privateChannels.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Including {privateChannels.length} private channel
          {privateChannels.length === 1 ? "" : "s"} from your Slack account.
          Dust must still be added to a private channel to reply there.
        </div>
      )}

      <SearchInput
        name="slack-channel-search"
        placeholder="Search channels..."
        value={searchQuery}
        onChange={setSearchQuery}
      />

      {isLoading ? (
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
                  {channel.isPrivate && (
                    <Icon
                      visual={Lock01}
                      size="xs"
                      className="text-muted-foreground"
                    />
                  )}
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

  const stateFromChannels = useCallback(
    (channels: typeof slackChannels) => {
      const ch = channels ?? [];
      return {
        localSlackChannels: [...ch],
        autoRespondWithoutMentionEnabled:
          ch[0]?.autoRespondWithoutMention ?? false,
        skipThreadRepliesEnabled:
          ch[0]?.autoRespondWithoutMentionSkipThreadReplies ?? false,
      };
    },
    []
  );

  const [
    {
      localSlackChannels,
      autoRespondWithoutMentionEnabled,
      skipThreadRepliesEnabled,
    },
    setLocalState,
  ] = useState(() => stateFromChannels(slackChannels));

  useEffect(() => {
    setLocalState(stateFromChannels(slackChannels));
  }, [slackChannels, stateFromChannels]);

  useEffect(() => {
    if (isOpen) {
      setLocalState(stateFromChannels(slackChannels));
    }
  }, [isOpen, slackChannels, stateFromChannels]);

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
