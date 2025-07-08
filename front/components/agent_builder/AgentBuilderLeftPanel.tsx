import { BarFooter, BarHeader, Button, XMarkIcon } from "@dust-tt/sparkle";
import React from "react";

import { AgentBuilderCapabilitiesBlock } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesBlock";
import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";
import { AgentBuilderSettingsBlock } from "@app/components/agent_builder/settings/AgentBuilderSettingsBlock";
import { ConfirmContext } from "@app/components/Confirm";

interface AgentBuilderLeftPanelProps {
  title: string;
  onSave?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  isDisabled?: boolean;
}

export function AgentBuilderLeftPanel({
  title,
  onSave,
  onCancel,
  isSaving,
  isDisabled,
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
          <AgentBuilderInstructionsBlock />
          <AgentBuilderCapabilitiesBlock />
          <AgentBuilderSettingsBlock />
        </div>
      </div>
      <BarFooter
        variant="default"
        rightActions={
          <BarFooter.ButtonBar
            variant="validate"
            onCancel={handleCancel}
            onSave={onSave}
            isSaving={isSaving}
            isDisabled={isDisabled}
          />
        }
      />
    </div>
  );
}
