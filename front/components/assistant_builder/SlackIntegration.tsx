import { ContentMessage, Modal, Page, SlackLogo } from "@dust-tt/sparkle";
import type {
  BaseContentNode,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { useCallback, useEffect, useState } from "react";

import type { ContentNodeTreeItemStatus } from "@app/components/ContentNodeTree";
import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { useConnectorPermissions } from "@app/lib/swr/connectors";

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
      viewType: "documents",
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
    if (existingSelection.length > 0 && newSelection.length === 0) {
      setNewSelection(existingSelection);
    }
  }, [existingSelection, newSelection]);

  const customIsNodeChecked = useCallback(
    (node: BaseContentNode) => {
      return (
        newSelection?.some((c) => c.slackChannelId === node.internalId) || false
      );
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
              (c) => c.slackChannelId === node.internalId
            );

            if (isSelected && index === -1) {
              newSelection.push({
                slackChannelId: node.internalId,
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
      isSearchEnabled={false}
      useResourcesHook={useResourcesHook}
    />
  );
}

interface SlackAssistantDefaultManagerProps {
  assistantHandle?: string;
  existingSelection: SlackChannel[];
  isAdmin: boolean;
  onClose: () => void;
  onSave: (channels: SlackChannel[]) => void;
  owner: WorkspaceType;
  show: boolean;
  slackDataSource: DataSourceType;
}

export function SlackAssistantDefaultManager({
  assistantHandle,
  existingSelection,
  isAdmin,
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
    <>
      <Modal
        hasChanged={hasChanged}
        isOpen={show}
        onClose={onClose}
        onSave={saveChanges}
        title="Slack Integration"
        variant="side-sm"
      >
        <div className="pt-8">
          <Page.Vertical gap="lg" align="stretch">
            <div className="flex flex-col gap-y-2">
              <div className="grow text-sm font-medium text-element-800">
                <SlackLogo className="h-8 w-8" />
              </div>

              <div className="text-sm font-normal text-element-900">
                Set this assistant as the default assistant on one or several of
                your Slack channels. It will answer by default when the{" "}
                <span className="font-bold">{assistantHandle}</span> Slack bot
                is mentionned in these channels.
              </div>

              {!isAdmin && (
                <ContentMessage
                  size="md"
                  variant="pink"
                  title="Admin Access Required"
                >
                  <p>
                    Only administrators can enable default assistants for
                    specific Slack channels.
                  </p>
                </ContentMessage>
              )}

              {isAdmin && (
                <SlackIntegration
                  existingSelection={existingSelection}
                  onSelectionChange={handleSelectionChange}
                  owner={owner}
                  slackDataSource={slackDataSource}
                />
              )}
            </div>
          </Page.Vertical>
        </div>
      </Modal>
    </>
  );
}
