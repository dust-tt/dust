import { BarHeader } from "@dust-tt/sparkle";
import React from "react";

import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";

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
      <div className="flex-1 p-4">
        <AgentBuilderInstructionsBlock />
      </div>
    </div>
  );
}
