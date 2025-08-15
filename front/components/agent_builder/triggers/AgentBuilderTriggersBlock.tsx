import type { WorkspaceType } from "@dust-tt/client";
import {
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Spinner,
  TimeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { CreateScheduleModal } from "@app/components/agent_builder/triggers/CreateScheduleModal";
import { TriggerSelectorDropdown } from "@app/components/agent_builder/triggers/TriggerSelectorDropdown";
import { useSendNotification } from "@app/hooks/useNotification";
import type {
  TriggerKind,
  LightTriggerType,
} from "@app/types/assistant/triggers";

const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("/static/IconBar.svg")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 14px",
  backgroundSize: "auto 60px",
  paddingTop: "90px",
};

function getIcon(kind: TriggerKind) {
  switch (kind) {
    case "schedule":
      return (
        <TimeIcon className="h-4 w-4 text-foreground dark:text-foreground-night" />
      );
    default:
      return null;
  }
}

interface TriggerCardProps {
  trigger: LightTriggerType;
  onRemove: () => void;
  onEdit?: () => void;
}

function TriggerCard({ trigger, onRemove, onEdit }: TriggerCardProps) {
  return (
    <Card
      variant="primary"
      className="h-28"
      onClick={onEdit}
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: Event) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          {getIcon(trigger.kind)}
          <span className="truncate">{trigger.name}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">
            {trigger.description}
          </span>
        </div>
      </div>
    </Card>
  );
}

interface AgentBuilderTriggersBlockProps {
  owner: WorkspaceType;
  agentConfigurationId: string | null;
}

export function AgentBuilderTriggersBlock({
  owner,
  agentConfigurationId,
}: AgentBuilderTriggersBlockProps) {
  // Use form context for managing all triggers
  const { fields: triggers, remove, append, update } = useFieldArray<
    AgentBuilderFormData,
    "triggers"
  >({
    name: "triggers",
  });

  const sendNotification = useSendNotification();
  const [editingTrigger, setEditingTrigger] = useState<{
    trigger: LightTriggerType;
    index: number;
  } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleTriggerEdit = (trigger: LightTriggerType, index: number) => {
    setEditingTrigger({ trigger, index });
  };

  const handleCreateTrigger = () => {
    setIsCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingTrigger(null);
    setIsCreateModalOpen(false);
  };

  const handleTriggerSave = (trigger: LightTriggerType) => {
    if (editingTrigger) {
      // Editing existing trigger
      update(editingTrigger.index, trigger);
    } else {
      // Creating new trigger
      append(trigger);
    }
    handleCloseModal();
  };

  const handleTriggerRemove = (trigger: LightTriggerType, index: number) => {
    remove(index);
    sendNotification({
      type: "success",
      title: `Successfully removed ${trigger.name}`,
      description: `Trigger "${trigger.name}" will be removed when you save the agent.`,
    });
  };

  return (
    <AgentBuilderSectionContainer
      title="Triggers"
      description="Triggers agent execution based on events."
      headerActions={
        triggers.length > 0 ? (
          <TriggerSelectorDropdown onCreateTrigger={handleCreateTrigger} />
        ) : undefined
      }
    >
      <div className="flex-1">
        {triggers.length === 0 ? (
          <EmptyCTA
            action={
              <TriggerSelectorDropdown onCreateTrigger={handleCreateTrigger} />
            }
            className="pb-5"
            style={BACKGROUND_IMAGE_STYLE_PROPS}
          />
        ) : (
          <CardGrid>
            {triggers.map((trigger, index) => (
              <TriggerCard
                key={trigger.sId || index}
                trigger={trigger}
                onRemove={() => handleTriggerRemove(trigger, index)}
                onEdit={() => handleTriggerEdit(trigger, index)}
              />
            ))}
          </CardGrid>
        )}
      </div>

      {/* Create/Edit Schedule Modal */}
      <CreateScheduleModal
        trigger={editingTrigger?.trigger}
        isOpen={editingTrigger !== null || isCreateModalOpen}
        onClose={handleCloseModal}
        onSave={handleTriggerSave}
      />
    </AgentBuilderSectionContainer>
  );
}
