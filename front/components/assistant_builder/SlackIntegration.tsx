import { ContentMessage, Modal, Page, SlackLogo } from "@dust-tt/sparkle";
import type {
  BaseContentNode,
  ConnectorPermission,
  DataSourceViewType,
  WorkspaceType,
} from "@dust-tt/types";
import { useCallback, useEffect, useState } from "react";
import React from "react";

import type { PermissionTreeNodeStatus } from "@app/components/ConnectorPermissionsTree";
import { PermissionTree } from "@app/components/ConnectorPermissionsTree";
import { useConnectorPermissions } from "@app/lib/swr/connectors";

export type SlackChannel = { slackChannelId: string; slackChannelName: string };

interface SlacIntegrationProps {
  existingSelection: SlackChannel[];
  onSelectionChange: (channels: SlackChannel[]) => void;
  owner: WorkspaceType;
  slackDataSourceView: DataSourceViewType;
}

export function SlackIntegration({
  existingSelection,
  onSelectionChange,
  owner,
  slackDataSourceView,
}: SlacIntegrationProps) {
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

  const handlePermissionUpdate = useCallback(
    (
      node: BaseContentNode,
      { newPermission }: { newPermission: ConnectorPermission }
    ) => {
      const { internalId, title } = node;

      setNewSelection((prevSelection) => {
        const channel = { slackChannelId: internalId, slackChannelName: title };
        const index = prevSelection.findIndex(
          (c) => c.slackChannelId === internalId
        );

        if (newPermission === "read_write" && index === -1) {
          return [...prevSelection, channel];
        }

        if (newPermission !== "read_write" && index !== -1) {
          return prevSelection.filter((_, i) => i !== index);
        }

        return prevSelection;
      });
    },
    [setNewSelection]
  );

  // Notify parent component when newSelection changes.
  useEffect(() => {
    if (newSelection !== null) {
      onSelectionChange(newSelection);
    }
  }, [newSelection, onSelectionChange]);

  // The "write" permission filter is applied to retrieve all available channels on Slack,
  const useResourcesHook = (parentId: string | null) =>
    useConnectorPermissions({
      dataSource: slackDataSourceView.dataSource,
      filterPermission: "write",
      owner,
      parentId,
      viewType: "documents",
    });

  const { resources } = useResourcesHook(null);
  const treeSelectionModel = resources.reduce(
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
    {} as Record<string, PermissionTreeNodeStatus>
  );

  return (
    <PermissionTree
      // not limited to those synced with Dust.
      treeSelectionModel={treeSelectionModel}
      setTreeSelectionModel={(
        updater:
          | ((
              prev: Record<string, PermissionTreeNodeStatus>
            ) => Record<string, PermissionTreeNodeStatus>)
          | Record<string, PermissionTreeNodeStatus>
      ) => {
        const newModel =
          typeof updater === "function" ? updater(treeSelectionModel) : updater;

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
  slackDataSourceView: DataSourceViewType;
}

export function SlackAssistantDefaultManager({
  assistantHandle,
  existingSelection,
  isAdmin,
  onClose,
  onSave,
  owner,
  show,
  slackDataSourceView,
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
                  slackDataSourceView={slackDataSourceView}
                />
              )}
            </div>
          </Page.Vertical>
        </div>
      </Modal>
    </>
  );
}
