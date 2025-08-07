import type { ButtonProps } from "@dust-tt/sparkle";
import {
  BarFooter,
  BarHeader,
  Button,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React from "react";

import { AgentBuilderCapabilitiesBlock } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesBlock";
import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";
import { AgentBuilderSettingsBlock } from "@app/components/agent_builder/settings/AgentBuilderSettingsBlock";
import { ConfirmContext } from "@app/components/Confirm";
import { AgentBuilderTriggersBlock } from "@app/components/agent_builder/triggers/AgentBuilderTriggersBlock";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";

interface AgentBuilderLeftPanelProps {
  title: string;
  onCancel: () => void;
  agentConfigurationId: string | null;
  saveButtonProps?: ButtonProps;
}

export function AgentBuilderLeftPanel({
  title,
  onCancel,
  agentConfigurationId,
  saveButtonProps,
}: AgentBuilderLeftPanelProps) {
  const confirm = React.useContext(ConfirmContext);

  const { owner } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

  const handleCancel = async () => {
    const confirmed = await confirm({
      title: "Confirm Exit",
      message:
        "Are you sure you want to exit? Any unsaved changes will be lost.",
      validateLabel: "Yes",
      validateVariant: "warning",
    });

    if (confirmed) {
      onCancel();
    }
  };
  return (
    <div className="flex h-full flex-col">
      <BarHeader
        variant="default"
        title={title}
        rightActions={
          <Button
            size="sm"
            icon={XMarkIcon}
            variant="ghost"
            tooltip="Close"
            onClick={handleCancel}
          />
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          <AgentBuilderInstructionsBlock
            agentConfigurationId={agentConfigurationId}
          />
          <Separator />
          <AgentBuilderCapabilitiesBlock />
          {hasFeature("hootl") && (
            <>
              <Separator />
              <AgentBuilderTriggersBlock />
            </>
          )}
          <Separator />
          <AgentBuilderSettingsBlock
            isSettingBlocksOpen={!agentConfigurationId}
          />
        </div>
      </div>
      <BarFooter
        variant="default"
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
