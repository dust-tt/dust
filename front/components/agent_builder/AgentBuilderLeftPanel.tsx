import { BarHeader } from "@dust-tt/sparkle";
import React from "react";

import { AgentBuilderCapabilitiesBlock } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesBlock";
import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";
import { AgentBuilderSettingsBlock } from "@app/components/agent_builder/settings/AgentBuilderSettingsBlock";

interface AgentBuilderLeftPanelProps {
  title: string;
  onSave?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function AgentBuilderLeftPanel({
  title,
  onSave,
  onCancel,
  isSaving,
}: AgentBuilderLeftPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10">
        <BarHeader
          variant="default"
          title={title}
          rightActions={
            <BarHeader.ButtonBar
              variant="validate"
              onCancel={onCancel}
              onSave={onSave}
              isSaving={isSaving}
            />
          }
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-4">
          <AgentBuilderInstructionsBlock />
          <AgentBuilderCapabilitiesBlock />
          <AgentBuilderSettingsBlock />
        </div>
      </div>
    </div>
  );
}
