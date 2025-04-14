import {
  Avatar,
  Button,
  Card,
  ContentMessage,
  InformationCircleIcon,
  Spinner,
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

export function ChildAgentConfigurationSection({
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
      <Card variant="secondary" size="sm" className="h-36 w-full">
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      </Card>
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
      <div className="flex-grow pt-4 text-sm font-semibold text-foreground dark:text-foreground-night">
        Selected Agent
      </div>
      {selectedAgent ? (
        <Card size="sm" className="w-full">
          <div className="flex w-full p-3">
            <div className="flex w-full flex-grow flex-col gap-2 overflow-hidden">
              <div className="flex items-center gap-2">
                <Avatar
                  size="sm"
                  name={selectedAgent.name}
                  visual={selectedAgent.pictureUrl}
                />
                <div className="text-md font-medium">{selectedAgent.name}</div>
              </div>
              <div className="max-h-24 overflow-y-auto text-sm text-muted-foreground dark:text-muted-foreground-night">
                {selectedAgent.description || "No description available"}
              </div>
            </div>
            <div className="ml-4 flex-shrink-0 self-start">
              <AssistantPicker
                owner={owner}
                assistants={agentConfigurations.filter(
                  (agent) => agent.sId !== selectedAgentId
                )}
                onItemClick={(agent) => {
                  onAgentSelect(agent.sId);
                }}
                pickerButton={
                  <Button
                    size="sm"
                    label="Select another agent"
                    isLoading={isAgentConfigurationsLoading}
                  />
                }
                showFooterButtons={false}
              />
            </div>
          </div>
        </Card>
      ) : (
        <Card size="sm" className="h-36 w-full">
          <div className="flex h-full w-full items-center justify-center">
            <AssistantPicker
              owner={owner}
              assistants={agentConfigurations}
              onItemClick={(agent) => {
                onAgentSelect(agent.sId);
              }}
              pickerButton={
                <Button
                  size="sm"
                  label="Select Agent"
                  isLoading={isAgentConfigurationsLoading}
                />
              }
              showFooterButtons={false}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
