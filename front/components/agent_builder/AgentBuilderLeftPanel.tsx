import type { ButtonProps } from "@dust-tt/sparkle";
import {
  BarFooter,
  BarHeader,
  Button,
  ScrollArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { AgentBuilderCapabilitiesBlock } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesBlock";
import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";
import { AgentBuilderSettingsBlock } from "@app/components/agent_builder/settings/AgentBuilderSettingsBlock";
import { AgentBuilderTriggersBlock } from "@app/components/agent_builder/triggers/AgentBuilderTriggersBlock";

interface AgentBuilderLeftPanelProps {
  title: string;
  onCancel: () => void;
  agentConfigurationId: string | null;
  saveButtonProps?: ButtonProps;
  isActionsLoading: boolean;
  isTriggersLoading?: boolean;
}

export function AgentBuilderLeftPanel({
  title,
  onCancel,
  agentConfigurationId,
  saveButtonProps,
  isActionsLoading,
  isTriggersLoading,
}: AgentBuilderLeftPanelProps) {
  const { owner } = useAgentBuilderContext();

  const handleCancel = async () => {
    onCancel();
  };
  return (
    <div className="flex h-full w-full flex-col">
      <BarHeader
        variant="default"
        className="mx-4"
        title={title}
        rightActions={
          <Button
            icon={XMarkIcon}
            onClick={handleCancel}
            variant="ghost"
            type="button"
          />
        }
      />
      <ScrollArea className="flex-1">
        <div className="mx-auto space-y-10 p-4 2xl:max-w-5xl">
          <AgentBuilderInstructionsBlock
            agentConfigurationId={agentConfigurationId}
          />
          <AgentBuilderCapabilitiesBlock isActionsLoading={isActionsLoading} />
          <AgentBuilderTriggersBlock
            owner={owner}
            isTriggersLoading={isTriggersLoading}
            agentConfigurationId={agentConfigurationId}
          />
          <AgentBuilderSettingsBlock
            agentConfigurationId={agentConfigurationId}
          />
        </div>
      </ScrollArea>
      <BarFooter
        variant="default"
        className="mx-4 justify-between"
        leftActions={
          <Button
            variant="outline"
            label="Cancel"
            onClick={handleCancel}
            type="button"
          />
        }
        rightActions={
          <BarFooter.ButtonBar
            variant="validate"
            saveButtonProps={saveButtonProps}
          />
        }
      />
    </div>
  );
}
