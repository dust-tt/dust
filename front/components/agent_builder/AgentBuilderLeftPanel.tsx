import type { RegularButtonProps } from "@dust-tt/sparkle";
import { BarFooter, BarHeader, Button, XMarkIcon } from "@dust-tt/sparkle";
import React from "react";

import { AgentBuilderCapabilitiesBlock } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesBlock";
import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";
import { AgentBuilderSettingsBlock } from "@app/components/agent_builder/settings/AgentBuilderSettingsBlock";
import { ConfirmContext } from "@app/components/Confirm";

interface AgentBuilderLeftPanelProps {
  title: string;
  onCancel: () => void;
  agentConfigurationId: string | null;
  saveButtonProps?: RegularButtonProps;
}

export function AgentBuilderLeftPanel({
  title,
  onCancel,
  agentConfigurationId,
  saveButtonProps,
}: AgentBuilderLeftPanelProps) {
  const confirm = React.useContext(ConfirmContext);

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
        <div className="space-y-6 p-4">
          <AgentBuilderInstructionsBlock
            agentConfigurationId={agentConfigurationId}
          />
          <AgentBuilderCapabilitiesBlock />
          <AgentBuilderSettingsBlock />
        </div>
      </div>
      <BarFooter
        variant="default"
        rightActions={
          <BarFooter.ButtonBar
            variant="validate"
            cancelButtonProps={{
              size: "sm",
              label: "Cancel",
              variant: "ghost",
              onClick: handleCancel,
            }}
            saveButtonProps={saveButtonProps}
          />
        }
      />
    </div>
  );
}
