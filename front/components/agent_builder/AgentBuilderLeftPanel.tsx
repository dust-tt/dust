import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { AgentBuilderSpacesBlock } from "@app/components/agent_builder/AgentBuilderSpacesBlock";
import { AgentBuilderInstructionsBlock } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsBlock";
import { AgentBuilderSettingsBlock } from "@app/components/agent_builder/settings/AgentBuilderSettingsBlock";
import { AgentBuilderCapabilitiesBlock } from "@app/components/agent_builder/skills/AgentBuilderCapabilitiesBlock";
import { AgentBuilderTriggersBlock } from "@app/components/agent_builder/triggers/AgentBuilderTriggersBlock";
import type { ButtonProps } from "@dust-tt/sparkle";
import {
  BarFooter,
  BarHeader,
  Button,
  cn,
  ScrollArea,
  XClose,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

interface AgentBuilderLeftPanelProps {
  title: string;
  onCancel: () => void;
  agentConfigurationId: string | null;
  saveButtonProps?: ButtonProps;
  editorGateMessage?: ReactNode;
  isTriggersLoading?: boolean;
  initialRequestedSpaceIds?: string[];
  isEditorGateVisible: boolean;
  isAddingSelfAsEditor: boolean;
  onAddSelfAsEditor: () => void;
  hasUnsavedChanges: boolean;
}

export function AgentBuilderLeftPanel({
  title,
  onCancel,
  agentConfigurationId,
  saveButtonProps,
  editorGateMessage,
  isTriggersLoading,
  initialRequestedSpaceIds,
  isEditorGateVisible,
  isAddingSelfAsEditor,
  onAddSelfAsEditor,
  hasUnsavedChanges,
}: AgentBuilderLeftPanelProps) {
  const { owner } = useAgentBuilderContext();

  const handleCancel = async () => {
    onCancel();
  };
  return (
    <div className="flex h-full w-full flex-col">
      <BarHeader
        variant="default"
        title={title}
        rightActions={
          hasUnsavedChanges ? undefined : (
            <Button
              icon={XClose}
              onClick={handleCancel}
              variant="ghost"
              type="button"
            />
          )
        }
      />
      <ScrollArea className="flex-1">
        <div className="mx-auto space-y-10 p-4 2xl:max-w-5xl">
          {editorGateMessage}
          <AgentBuilderInstructionsBlock
            agentConfigurationId={agentConfigurationId}
          />
          <AgentBuilderSpacesBlock
            initialRequestedSpaceIds={initialRequestedSpaceIds}
          />
          <AgentBuilderCapabilitiesBlock
            initialRequestedSpaceIds={initialRequestedSpaceIds}
          />
          <AgentBuilderTriggersBlock
            owner={owner}
            isTriggersLoading={isTriggersLoading}
            agentConfigurationId={agentConfigurationId}
          />
          <AgentBuilderSettingsBlock
            agentConfigurationId={agentConfigurationId}
            initialRequestedSpaceIds={initialRequestedSpaceIds}
            isEditorGateVisible={isEditorGateVisible}
            isAddingSelfAsEditor={isAddingSelfAsEditor}
            onAddSelfAsEditor={onAddSelfAsEditor}
          />
        </div>
      </ScrollArea>
      <div
        className={cn(
          "grid shrink-0 transition-[grid-template-rows] duration-300 ease-in-out",
          hasUnsavedChanges ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <BarFooter
            variant="default"
            className="justify-between"
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
      </div>
    </div>
  );
}
