import { BarHeader } from "@dust-tt/sparkle";
import React from "react";

interface AgentBuilderLeftPanelProps {
  title: string;
  onSave?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  children?: React.ReactNode;
}

export function AgentBuilderLeftPanel({
  title,
  onSave,
  onCancel,
  isSaving,
  children,
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
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
