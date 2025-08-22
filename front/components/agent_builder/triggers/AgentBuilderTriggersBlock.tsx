import {
  Button,
  Card,
  CardActionButton,
  CardGrid,
  ClockIcon,
  EmptyCTA,
  Spinner,
  TimeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import { useFieldArray } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { ScheduleEditionModal } from "@app/components/agent_builder/triggers/ScheduleEditionModal";
import { useSendNotification } from "@app/hooks/useNotification";
import type { TriggerKind } from "@app/types/assistant/triggers";

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
  trigger: AgentBuilderTriggerType;
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

      </div>
    </Card>
  );
}

type DialogMode =
  | {
      type: "add";
    }
  | {
      type: "edit";
      trigger: AgentBuilderTriggerType;
      index: number;
    };

interface AgentBuilderTriggersBlockProps {
  isTriggersLoading?: boolean;
}

export function AgentBuilderTriggersBlock({
  isTriggersLoading,
}: AgentBuilderTriggersBlockProps) {
  const {
    fields: triggers,
    remove,
    append,
    update,
  } = useFieldArray<AgentBuilderFormData, "triggers">({
    name: "triggers",
  });

  const sendNotification = useSendNotification();
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);

  const handleCreateTrigger = () => {
    setDialogMode({
      type: "add",
    });
  };

  const handleTriggerEdit = (
    trigger: AgentBuilderTriggerType,
    index: number
  ) => {
    setDialogMode({ type: "edit", trigger, index });
  };

  const handleCloseModal = () => {
    setDialogMode(null);
  };

  const handleTriggerSave = (trigger: AgentBuilderTriggerType) => {
    if (dialogMode?.type === "edit") {
      update(dialogMode.index, trigger);
    } else {
      append(trigger);
    }
    handleCloseModal();
  };

  const handleTriggerRemove = (
    trigger: AgentBuilderTriggerType,
    index: number
  ) => {
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
        triggers.length > 0 && (
          <Button
            label="Add Schedule"
            variant="primary"
            icon={ClockIcon}
            onClick={handleCreateTrigger}
            type="button"
          />
        )
      }
    >
      <div className="flex-1">
        {isTriggersLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : triggers.length === 0 ? (
          <EmptyCTA
            action={
              <Button
                label="Add Schedule"
                variant="primary"
                icon={ClockIcon}
                onClick={handleCreateTrigger}
              />
            }
            className="py-4"
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
      <ScheduleEditionModal
        trigger={dialogMode?.type === "edit" ? dialogMode.trigger : undefined}
        isOpen={dialogMode !== null}
        onClose={handleCloseModal}
        onSave={handleTriggerSave}
      />
    </AgentBuilderSectionContainer>
  );
}
