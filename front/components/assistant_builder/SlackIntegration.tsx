import {
  ContentMessage,
  InformationCircleIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import type { ContentNodeTreeItemStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useConnectorPermissions } from "@app/lib/swr/connectors";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { ContentNode, DataSourceType, WorkspaceType } from "@app/types";
import { isAdmin } from "@app/types";

export type SlackChannel = {
  slackChannelId: string;
  slackChannelName: string;
  autoRespondWithoutMention?: boolean;
};

// The "write" permission filter is applied to retrieve all available channels on Slack,
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

export function SlackIntegration({
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
      // not limited to those synced with Dust.
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

interface SlackAssistantDefaultManagerProps {
  assistantHandle?: string;
  existingSelection: SlackChannel[];
  onClose: () => void;
  onSave: (channels: SlackChannel[]) => void;
  owner: WorkspaceType;
  show: boolean;
  slackDataSource: DataSourceType;
}

export function SlackAssistantDefaultManager({
  assistantHandle,
  existingSelection,
  onClose,
  onSave,
  owner,
  show,
  slackDataSource,
}: SlackAssistantDefaultManagerProps) {
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const [selectedChannels, setSelectedChannels] =
    useState<SlackChannel[]>(existingSelection);
  const [
    autoRespondWithoutMentionEnabled,
    setAutoRespondWithoutMentionEnabled,
  ] = useState(false);
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => {
    const currentAutoRespondWithoutMention =
      existingSelection.length > 0
        ? existingSelection[0].autoRespondWithoutMention || false
        : false;
    setAutoRespondWithoutMentionEnabled(currentAutoRespondWithoutMention);
  }, [existingSelection]);

  const handleSelectionChange = (newSelection: SlackChannel[]) => {
    setSelectedChannels(newSelection);
    setHasChanged(true);
  };

  const saveChanges = () => {
    const channelsWithEnhancedDefault = selectedChannels.map((channel) => ({
      ...channel,
      autoRespondWithoutMention: autoRespondWithoutMentionEnabled,
    }));
    onSave(channelsWithEnhancedDefault);
    setHasChanged(false);
    onClose();
  };

  return (
    <Sheet open={show} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Slack Integration</SheetTitle>
          <SheetDescription>
            Configure default Slack channels for this assistant
          </SheetDescription>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4">
            <div className="text-sm font-normal text-foreground dark:text-foreground-night">
              Set this agent as the default agent on one or several of your
              Slack channels. It will answer by default when the{" "}
              <span className="font-bold">{assistantHandle}</span> Slack bot is
              mentioned in these channels.
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
              <SlackIntegration
                existingSelection={existingSelection}
                onSelectionChange={handleSelectionChange}
                owner={owner}
                slackDataSource={slackDataSource}
              />
            )}

            {hasFeature("enhanced_default_agent") &&
              selectedChannels.length > 0 && (
                <div className="flex flex-col gap-2 border-t pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                        Enhanced Default Agent
                      </span>
                      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                        Agent will automatically respond to all messages and
                        thread replies in selected channels (not just @mentions)
                      </span>
                    </div>
                    <div className="flex-shrink-0">
                      <SliderToggle
                        selected={autoRespondWithoutMentionEnabled}
                        onClick={() => {
                          setAutoRespondWithoutMentionEnabled(
                            !autoRespondWithoutMentionEnabled
                          );
                          setHasChanged(true);
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            onClick: onClose,
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save",
            onClick: saveChanges,
            disabled: !hasChanged,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
