import "react-image-crop/dist/ReactCrop.css";

import { Modal, Page } from "@dust-tt/sparkle";
import type { DataSourceViewType, WorkspaceType } from "@dust-tt/types";
import { useEffect, useState } from "react";
import React from "react";

import DataSourceResourceSelectorTree from "@app/components/DataSourceResourceSelectorTree";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

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

  const selectedChannelIds = [
    ...new Set(newSelection?.map((c) => c.slackChannelId) ?? []),
  ];

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
            title={"Select Slack channels"}
            icon={CONNECTOR_CONFIGURATIONS["slack"].logoComponent}
            description={`Select the channels in which ${assistantName} will answer by default.`}
          />
          <DataSourceResourceSelectorTree
            owner={owner}
            dataSourceView={slackDataSourceView}
            selectedResourceIds={selectedChannelIds}
            onSelectChange={(node, parents, selected) => {
              setHasChanged(true);

              if (selected) {
                setNewSelection((sel) => {
                  const finalState: SlackChannel[] = [];
                  if (sel) {
                    finalState.push(...sel);
                  }
                  finalState.push({
                    slackChannelId: node.internalId,
                    slackChannelName: node.title,
                  });

                  return finalState;
                });
              } else {
                setNewSelection((sel) => {
                  const finalState: SlackChannel[] = [];
                  if (sel) {
                    finalState.push(...sel);
                  }
                  finalState.splice(
                    finalState.findIndex(
                      (c) => c.slackChannelId === node.internalId
                    ),
                    1
                  );
                  return finalState;
                });
              }
            }}
            showExpand={false}
            // Write are the channels we're in. Builders can get write but cannot get "none"
            // (reserved to admins).
            filterPermission="write"
          />
        </Page>
      </Modal>
    </>
  );
}
