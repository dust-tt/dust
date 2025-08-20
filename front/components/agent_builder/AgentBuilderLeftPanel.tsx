import type { ButtonProps } from "@dust-tt/sparkle";
import { BarFooter, BarHeader, Button, ScrollArea } from "@dust-tt/sparkle";
import React from "react";

import { AgentBuilderCapabilitiesBlock } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesBlock";
import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";
import { AgentAccessPublicationDialog } from "@app/components/agent_builder/settings/AgentAccessPublicationDialog";
import { AgentBuilderSettingsBlock } from "@app/components/agent_builder/settings/AgentBuilderSettingsBlock";

interface AgentBuilderLeftPanelProps {
  title: string;
  onCancel: () => void;
  agentConfigurationId: string | null;
  saveButtonProps?: ButtonProps;
  isActionsLoading: boolean;
}

export function AgentBuilderLeftPanel({
  title,
  onCancel,
  agentConfigurationId,
  saveButtonProps,
  isActionsLoading,
}: AgentBuilderLeftPanelProps) {
  const handleCancel = async () => {
    onCancel();
  };
  return (
    <div className="flex h-full flex-col">
      <BarHeader
        variant="default"
        className="px-4"
        title={title}
        rightActions={<AgentAccessPublicationDialog />}
      />
      <ScrollArea className="flex-1">
        <div className="mx-auto space-y-10 py-4 2xl:max-w-4xl">
          <AgentBuilderInstructionsBlock
            agentConfigurationId={agentConfigurationId}
          />
          <AgentBuilderCapabilitiesBlock isActionsLoading={isActionsLoading} />
          <AgentBuilderSettingsBlock
            isSettingBlocksOpen={!agentConfigurationId}
          />
        </div>
      </ScrollArea>
      <BarFooter
        variant="default"
        className="justify-between"
        leftActions={
          <Button
            variant="outline"
            label="Close"
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
