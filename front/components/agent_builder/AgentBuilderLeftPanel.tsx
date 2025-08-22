import type { ButtonProps } from "@dust-tt/sparkle";
import { BarFooter, BarHeader, Button, ScrollArea } from "@dust-tt/sparkle";
import React from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { AgentBuilderCapabilitiesBlock } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesBlock";
import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";
import { AgentBuilderSettingsBlock } from "@app/components/agent_builder/settings/AgentBuilderSettingsBlock";
import { EditorsSheet } from "@app/components/agent_builder/settings/EditorsSheet";
import { AgentBuilderTriggersBlock } from "@app/components/agent_builder/triggers/AgentBuilderTriggersBlock";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

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
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

  const handleCancel = async () => {
    onCancel();
  };
  return (
    <div className="flex h-full flex-col">
      <BarHeader
        variant="default"
        className="mx-4"
        title={title}
        rightActions={<EditorsSheet />}
      />
      <ScrollArea className="flex-1">
        <div className="mx-auto space-y-10 p-4 2xl:max-w-4xl">
          <AgentBuilderInstructionsBlock
            agentConfigurationId={agentConfigurationId}
          />
          <AgentBuilderCapabilitiesBlock isActionsLoading={isActionsLoading} />
          {hasFeature("hootl") && (
            <AgentBuilderTriggersBlock isTriggersLoading={isTriggersLoading} />
          )}
          <AgentBuilderSettingsBlock
            isSettingBlocksOpen={!agentConfigurationId}
          />
        </div>
      </ScrollArea>
      <BarFooter
        variant="default"
        className="mx-4 justify-between"
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
