import {
  Avatar,
  Button,
  ContentMessage,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import React from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types";

interface ChildAgentSelectorProps {
  owner: LightWorkspaceType;
  selectedAgentId: string | null;
  onAgentSelect: (agentId: string) => void;
}

export function ChildAgentSelector({
  owner,
  selectedAgentId,
  onAgentSelect,
}: ChildAgentSelectorProps) {
  const {
    agentConfigurations,
    isAgentConfigurationsLoading,
    isAgentConfigurationsError,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
  });

  if (isAgentConfigurationsError) {
    return (
      <ContentMessage
        title="Error loading agents"
        icon={InformationCircleIcon}
        variant="warning"
        size="sm"
      >
        Failed to load available agents. Please try again later.
      </ContentMessage>
    );
  }

  if (isAgentConfigurationsLoading) {
    return (
      <div className="text-element-600 py-2 text-sm">
        Loading available agents...
      </div>
    );
  }

  if (agentConfigurations.length === 0) {
    return (
      <ContentMessage
        title="No agents available"
        icon={InformationCircleIcon}
        variant="warning"
        size="sm"
      >
        There are no agents available to select. Please create an agent first.
      </ContentMessage>
    );
  }

  const selectedAgent = agentConfigurations.find(
    (agent) => agent.sId === selectedAgentId
  );

  return (
    <div className="flex flex-col gap-2">
      {selectedAgent ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar
              size="xs"
              name={selectedAgent.name}
              visual={selectedAgent.pictureUrl}
            />
            <div className="text-sm font-medium">{selectedAgent.name}</div>
          </div>
          <AssistantPicker
            owner={owner}
            assistants={agentConfigurations}
            onItemClick={(agent) => {
              onAgentSelect(agent.sId);
            }}
            pickerButton={
              <Button
                variant="secondary"
                size="sm"
                label="Change Agent"
                isLoading={isAgentConfigurationsLoading}
              />
            }
          />
        </div>
      ) : (
        <AssistantPicker
          owner={owner}
          assistants={agentConfigurations}
          onItemClick={(agent) => {
            onAgentSelect(agent.sId);
          }}
          pickerButton={
            <Button
              variant="secondary"
              size="sm"
              label="Select Agent"
              isLoading={isAgentConfigurationsLoading}
            />
          }
        />
      )}

      {selectedAgent && (
        <div className="text-element-600 mt-2 text-xs">
          <span className="font-medium">Description:</span>{" "}
          {selectedAgent.description || "No description available"}
        </div>
      )}
    </div>
  );
}
