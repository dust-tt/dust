import {
  Avatar,
  Button,
  Card,
  ContentMessage,
  InformationCircleIcon,
  Spinner,
} from "@dust-tt/sparkle";
import React from "react";
import { useController } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/mcp/sections/ConfigurationSectionContainer";
import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types";

interface ChildAgentSectionProps {
  owner: LightWorkspaceType;
}

export function ChildAgentSection({ owner }: ChildAgentSectionProps) {
  const { field, fieldState } = useController<
    MCPFormData,
    "configuration.childAgentId"
  >({
    name: "configuration.childAgentId",
  });

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

  if (!isAgentConfigurationsLoading && agentConfigurations.length === 0) {
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
    (agent) => agent.sId === field.value
  );

  if (field.value && !selectedAgent) {
    return (
      <ContentMessage
        title="The agent selected is not available to you"
        icon={InformationCircleIcon}
        variant="warning"
        size="sm"
      >
        The agent ({field.value}) selected is not available to you, either
        because it was archived or because you have lost access to it (based on
        a restricted space you're not a part of). As an editor you can still
        remove the Run Agent tool to add a new one pointing to another agent.
      </ContentMessage>
    );
  }

  return (
    <ConfigurationSectionContainer
      title="Selected Agent"
      error={fieldState.error?.message}
    >
      {isAgentConfigurationsLoading ? (
        <Card size="sm" className="h-36 w-full">
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        </Card>
      ) : selectedAgent ? (
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
                  (agent) => agent.sId !== field.value
                )}
                onItemClick={(agent) => {
                  field.onChange(agent.sId);
                }}
                pickerButton={
                  <Button
                    size="sm"
                    label="Select agent"
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
              assistants={agentConfigurations.filter(
                (agent) => agent.sId !== field.value
              )}
              onItemClick={(agent) => {
                field.onChange(agent.sId);
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
    </ConfigurationSectionContainer>
  );
}
