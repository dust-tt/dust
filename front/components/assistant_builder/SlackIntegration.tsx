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
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ContentNodeTreeItemStatus,
  VirtualizedContentNodeTreeItemStatus,
} from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { VirtualizedContentNodeTree } from "@app/components/VirtualizedContentNodeTree";
import { useConnectorPermissions } from "@app/lib/swr/connectors";
import type { ContentNode, DataSourceType, WorkspaceType } from "@app/types";
import { isAdmin } from "@app/types";

export type SlackChannel = { slackChannelId: string; slackChannelName: string };

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

  const { resources, isResourcesLoading } = useResourcesHook(null);

  // Defer initial render to avoid blocking the UI
  const [shouldRender, setShouldRender] = useState(false);
  
  useEffect(() => {
    if (!isResourcesLoading) {
      if (resources.length > 0) {
        const timer = setTimeout(() => {
          setShouldRender(true);
        }, 100);
        return () => clearTimeout(timer);
      } else {
        setShouldRender(true);
      }
    }
  }, [isResourcesLoading, resources.length]);

  // Create a Set for faster lookups instead of array.some() calls
  const selectedChannelIds = useMemo(() => {
    return new Set(newSelection.map((c) => c.slackChannelId));
  }, [newSelection]);

  // Optimized custom node check using Set lookup
  const optimizedCustomIsNodeChecked = useCallback(
    (node: ContentNode) => {
      const channelId = node.internalId.substring("slack-channel-".length);
      return selectedChannelIds.has(channelId);
    },
    [selectedChannelIds]
  );

  // Lazy computation - only compute when needed
  const selectedNodes = useMemo(() => {
    if (resources.length <= 100) {
      return resources.reduce(
        (acc, c) =>
          optimizedCustomIsNodeChecked(c)
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
    }
    return {};
  }, [resources, optimizedCustomIsNodeChecked]);

  const virtualizedSelectedNodes = useMemo(() => {
    if (resources.length > 100) {
      return resources.reduce(
        (acc, c) =>
          optimizedCustomIsNodeChecked(c)
            ? {
                ...acc,
                [c.internalId]: {
                  node: c,
                  isSelected: true,
                  parents: [],
                },
              }
            : acc,
        {} as Record<string, VirtualizedContentNodeTreeItemStatus>
      );
    }
    return {};
  }, [resources, optimizedCustomIsNodeChecked]);

  const handleSelectionChange = useCallback(
    (updater: (prev: any) => any) => {
      const newModel = updater(
        resources.length > 100 ? virtualizedSelectedNodes : selectedNodes
      );

      setNewSelection((prevSelection) => {
        const newSelection = [...prevSelection];
        Object.values(newModel).forEach((item: any) => {
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
    },
    [resources.length, virtualizedSelectedNodes, selectedNodes]
  );

  if (isResourcesLoading || !shouldRender) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        Loading channels...
      </div>
    );
  }

  // Use virtualized tree for large channel lists (>100 channels)
  if (resources.length > 100) {
    return (
      <VirtualizedContentNodeTree
        selectedNodes={virtualizedSelectedNodes}
        setSelectedNodes={handleSelectionChange}
        showExpand={false}
        useResourcesHook={useResourcesHook}
        isTitleFilterEnabled={true}
      />
    );
  }

  return (
    <ContentNodeTree
      // not limited to those synced with Dust.
      selectedNodes={selectedNodes}
      setSelectedNodes={handleSelectionChange}
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
  const [selectedChannels, setSelectedChannels] =
    useState<SlackChannel[]>(existingSelection);
  const [hasChanged, setHasChanged] = useState(false);

  const handleSelectionChange = (newSelection: SlackChannel[]) => {
    setSelectedChannels(newSelection);
    setHasChanged(true);
  };

  const saveChanges = () => {
    onSave(selectedChannels);
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
              mentionned in these channels.
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
