import {
  BellIcon,
  Button,
  CardGrid,
  ClockIcon,
  EmptyCTA,
  Hoverable,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import { useFieldArray } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { ScheduleEditionModal } from "@app/components/agent_builder/triggers/ScheduleEditionModal";
import { TriggerCard } from "@app/components/agent_builder/triggers/TriggerCard";
import { WebhookEditionModal } from "@app/components/agent_builder/triggers/WebhookEditionModal";
import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType } from "@app/types";
import type { TriggerKind } from "@app/types/assistant/triggers";

type DialogMode =
  | {
      type: "add";
      kind: TriggerKind;
    }
  | {
      type: "edit";
      trigger: AgentBuilderTriggerType;
      index: number;
    };

interface AgentBuilderTriggersBlockProps {
  owner: LightWorkspaceType;
  isTriggersLoading?: boolean;
}

export function AgentBuilderTriggersBlock({
  owner,
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

  const handleCreateTrigger = (kind: TriggerKind) => {
    setDialogMode({
      type: "add",
      kind,
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
      title="[BETA] Triggers"
      description={
        <>
          Triggers agent execution based on events. Need help? Check our{" "}
          <Hoverable
            variant="primary"
            href="https://docs.dust.tt/docs/scheduling-your-agent-beta#/"
            target="_blank"
          >
            guide
          </Hoverable>
          .
        </>
      }
      headerActions={
        triggers.length > 0 && (
          <>
            <Button
              label="Add Schedule"
              variant="outline"
              icon={ClockIcon}
              onClick={() => handleCreateTrigger("schedule")}
              type="button"
            />
            <Button
              label="Add Webhook"
              variant="outline"
              icon={BellIcon}
              onClick={() => handleCreateTrigger("webhook")}
              type="button"
            />
          </>
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
              <div className="flex space-x-2">
                <Button
                  label="Add Schedule"
                  variant="outline"
                  icon={ClockIcon}
                  onClick={() => handleCreateTrigger("schedule")}
                  type="button"
                />
                <Button
                  label="Add Webhook"
                  variant="outline"
                  icon={BellIcon}
                  onClick={() => handleCreateTrigger("webhook")}
                  type="button"
                />
              </div>
            }
            className="py-4"
          />
        ) : (
          <CardGrid>
            {triggers.map((trigger, index) => (
              <TriggerCard
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
        owner={owner}
        trigger={
          dialogMode?.type === "edit" && dialogMode.trigger.kind === "schedule"
            ? dialogMode.trigger
            : undefined
        }
        isOpen={
          (dialogMode?.type === "add" && dialogMode.kind === "schedule") ||
          (dialogMode?.type === "edit" &&
            dialogMode.trigger.kind === "schedule")
        }
        onClose={handleCloseModal}
        onSave={handleTriggerSave}
      />

      {/* Create/Edit Webhook Modal */}
      <WebhookEditionModal
        owner={owner}
        trigger={
          dialogMode?.type === "edit" && dialogMode.trigger.kind === "webhook"
            ? dialogMode.trigger
            : undefined
        }
        isOpen={
          (dialogMode?.type === "add" && dialogMode.kind === "webhook") ||
          (dialogMode?.type === "edit" && dialogMode.trigger.kind === "webhook")
        }
        onClose={handleCloseModal}
        onSave={handleTriggerSave}
      />
    </AgentBuilderSectionContainer>
  );
}
