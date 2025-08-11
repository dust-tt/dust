import type { ButtonProps } from "@dust-tt/sparkle";
import {
  BarFooter,
  BarHeader,
  Button,
  ScrollArea,
  Separator,
} from "@dust-tt/sparkle";
import React from "react";

import { AgentBuilderCapabilitiesBlock } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesBlock";
import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";
import { AgentAccessPublicationDialog } from "@app/components/agent_builder/settings/AgentAccessPublicationDialog";
import { AgentBuilderSettingsBlock } from "@app/components/agent_builder/settings/AgentBuilderSettingsBlock";
import { ConfirmContext } from "@app/components/Confirm";

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
        rightActions={<AgentAccessPublicationDialog />}
      />
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <AgentBuilderInstructionsBlock
            agentConfigurationId={agentConfigurationId}
          />
          <AgentBuilderCapabilitiesBlock isActionsLoading={isActionsLoading} />
          <Separator />
          <AgentBuilderSettingsBlock
            isSettingBlocksOpen={!agentConfigurationId}
          />
        </div>
      </ScrollArea>
      <BarFooter
        variant="default"
        leftActions={
          <Button variant="outline" label="Close" onClick={handleCancel} />
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
