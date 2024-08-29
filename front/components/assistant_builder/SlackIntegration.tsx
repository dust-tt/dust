import "react-image-crop/dist/ReactCrop.css";

import { Modal, Page } from "@dust-tt/sparkle";
import type {
  BaseContentNode,
  ConnectorPermission,
  DataSourceViewType,
  WorkspaceType,
} from "@dust-tt/types";
import { useCallback, useEffect, useState } from "react";
import React from "react";

import { DataSourcePermissionTreeChildren } from "@app/components/ConnectorPermissionsTree";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useConnectorPermissions } from "@app/lib/swr";

export type SlackChannel = { slackChannelId: string; slackChannelName: string };

interface SlacIntegrationProps {
  assistantHandle?: string;
  existingSelection: SlackChannel[];
  onClose: () => void;
  onSave: (channels: SlackChannel[]) => void;
  owner: WorkspaceType;
  show: boolean;
  slackDataSourceView: DataSourceViewType;
}

export function SlackIntegration({
  assistantHandle,
  existingSelection,
  onClose,
  onSave,
  owner,
  show,
  slackDataSourceView,
}: SlacIntegrationProps) {
  const [newSelection, setNewSelection] = useState<SlackChannel[] | null>(null);
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => {
    if (existingSelection.length > 0 && newSelection === null) {
      setNewSelection(existingSelection);
    }
  }, [existingSelection, newSelection]);

  const save = async () => {
    if (newSelection) {
      onSave(newSelection);
    }
  };

  const assistantName = assistantHandle
    ? `${assistantHandle}`
    : "This assistant";

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

      setHasChanged(true);
      setNewSelection((prevSelection) => {
        if (!prevSelection) {
          return [];
        }

        // Create a copy of the previous selection.
        const updatedSelection = [...prevSelection];

        // Find the index of the channel in the selection.
        const index = updatedSelection.findIndex(
          (channel) => channel.slackChannelId === internalId
        );

        if (newPermission === "read_write") {
          // If the channel isn't already in the selection, add it.
          if (index === -1) {
            updatedSelection.push({
              slackChannelId: internalId,
              slackChannelName: title,
            });
          }
        } else {
          // If the channel is in the selection, remove it.
          if (index !== -1) {
            updatedSelection.splice(index, 1);
          }
        }

        return updatedSelection;
      });
    },
    [setHasChanged, setNewSelection]
  );

  return (
    <>
      <Modal
        isOpen={show}
        variant="full-screen"
        hasChanged={hasChanged}
        onClose={onClose}
        title="Slack bot configuration"
        onSave={save}
      >
        <Page>
          <Page.Header
            title="Select Slack channels"
            icon={CONNECTOR_CONFIGURATIONS["slack"].logoComponent}
            description={`Select the channels in which ${assistantName} will answer by default.`}
          />
          <DataSourcePermissionTreeChildren
            owner={owner}
            dataSource={slackDataSourceView.dataSource}
            parentId={null}
            // The "write" permission filter is applied to retrieve all available channels on Slack,
            // not limited to those synced with Dust.
            permissionFilter="write"
            canUpdatePermissions={true}
            onPermissionUpdate={handlePermissionUpdate}
            showExpand={false}
            isSearchEnabled={false}
            customIsNodeChecked={customIsNodeChecked}
            displayDocumentSource={() => {}}
            useConnectorPermissionsHook={useConnectorPermissions}
          />
        </Page>
      </Modal>
    </>
  );
}
