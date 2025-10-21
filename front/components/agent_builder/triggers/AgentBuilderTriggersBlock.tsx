import {
  Button,
  CardGrid,
  ClockIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  Hoverable,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { ScheduleEditionModal } from "@app/components/agent_builder/triggers/ScheduleEditionModal";
import { TriggerCard } from "@app/components/agent_builder/triggers/TriggerCard";
import { WebhookEditionModal } from "@app/components/agent_builder/triggers/WebhookEditionModal";
import { WebhookSourceViewIcon } from "@app/components/triggers/WebhookSourceViewIcon";
import { useSendNotification } from "@app/hooks/useNotification";
import { useWebhookSourceViewsFromSpaces } from "@app/lib/swr/webhook_source";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types";
import type { TriggerKind } from "@app/types/assistant/triggers";

type DialogMode =
  | {
      type: "add";
      kind: TriggerKind;
      webhookSourceViewSId?: string;
    }
  | {
      type: "edit";
      trigger: AgentBuilderTriggerType;
      index: number;
    };

interface AgentBuilderTriggersBlockProps {
  owner: LightWorkspaceType;
  isTriggersLoading?: boolean;
  agentConfigurationId: string | null;
}

export function AgentBuilderTriggersBlock({
  owner,
  isTriggersLoading,
  agentConfigurationId,
}: AgentBuilderTriggersBlockProps) {
  const { getValues, setValue } = useFormContext<AgentBuilderFormData>();

  const {
    fields: triggersToCreate,
    remove: removeFromCreate,
    append: appendToCreate,
    update: updateInCreate,
  } = useFieldArray<AgentBuilderFormData, "triggersToCreate">({
    name: "triggersToCreate",
  });

  const {
    fields: triggersToUpdate,
    remove: removeFromUpdate,
    append: appendToUpdate,
    update: updateInUpdate,
  } = useFieldArray<AgentBuilderFormData, "triggersToUpdate">({
    name: "triggersToUpdate",
  });

  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

  const sendNotification = useSendNotification();
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);

  const { spaces } = useSpacesContext();
  const { webhookSourceViews } = useWebhookSourceViewsFromSpaces(
    owner,
    spaces,
    !hasFeature("hootl_webhooks")
  );

  const accessibleSpaceIds = useMemo(
    () => new Set(spaces.map((space) => space.sId)),
    [spaces]
  );

  const accessibleWebhookSourceViews = useMemo(
    () =>
      webhookSourceViews.filter((view) => accessibleSpaceIds.has(view.spaceId)),
    [webhookSourceViews, accessibleSpaceIds]
  );

  // Combine triggers for display, excluding those marked for deletion
  const allTriggers = [
    ...triggersToCreate.map((t, index) => ({
      trigger: t,
      index,
      source: "create" as const,
    })),
    ...triggersToUpdate.map((t, index) => ({
      trigger: t,
      index,
      source: "update" as const,
    })),
  ];

  const handleCreateTrigger = (
    kind: TriggerKind,
    webhookSourceViewSId?: string
  ) => {
    setDialogMode({
      type: "add",
      kind,
      webhookSourceViewSId,
    });
  };

  const handleTriggerEdit = (
    trigger: AgentBuilderTriggerType,
    displayIndex: number
  ) => {
    setDialogMode({ type: "edit", trigger, index: displayIndex });
  };

  const handleCloseModal = () => {
    setDialogMode(null);
  };

  const handleTriggerSave = (trigger: AgentBuilderTriggerType) => {
    if (dialogMode?.type === "edit") {
      // Find the trigger in either create or update arrays
      const displayItem = allTriggers[dialogMode.index];
      if (displayItem.source === "create") {
        updateInCreate(displayItem.index, trigger);
      } else {
        updateInUpdate(displayItem.index, trigger);
      }
    } else {
      // New trigger - determine if it should go to create or update
      if (trigger.sId) {
        appendToUpdate(trigger);
      } else {
        appendToCreate(trigger);
      }
    }
    handleCloseModal();
  };

  const handleTriggerRemove = (
    trigger: AgentBuilderTriggerType,
    displayIndex: number
  ) => {
    const displayItem = allTriggers[displayIndex];

    if (displayItem.source === "create") {
      // Just remove from create array
      removeFromCreate(displayItem.index);
    } else {
      // Has sId, so it exists on backend - mark for deletion
      if (trigger.sId) {
        const currentToDelete = getValues("triggersToDelete");
        setValue("triggersToDelete", [...currentToDelete, trigger.sId]);
      }
      removeFromUpdate(displayItem.index);
    }

    sendNotification({
      type: "success",
      title: `Successfully removed ${trigger.name}`,
      description: `Trigger "${trigger.name}" will be removed when you save the agent.`,
    });
  };

  return (
    <AgentBuilderSectionContainer
      title="Triggers"
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
        allTriggers.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label="Add Trigger"
                variant="outline"
                isSelect
                type="button"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                label="Schedule"
                icon={ClockIcon}
                onClick={() => handleCreateTrigger("schedule")}
              />
              {hasFeature("hootl_webhooks") &&
                accessibleWebhookSourceViews.map((view) => (
                  <DropdownMenuItem
                    key={view.sId}
                    label={view.customName}
                    icon={(props) => (
                      <WebhookSourceViewIcon
                        webhookSourceView={view}
                        size="sm"
                      />
                    )}
                    onClick={() => handleCreateTrigger("webhook", view.sId)}
                  />
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
      isBeta
    >
      <div className="flex-1">
        {isTriggersLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : allTriggers.length === 0 ? (
          <EmptyCTA
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    label="Add Trigger"
                    variant="outline"
                    isSelect
                    type="button"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    label="Schedule"
                    icon={ClockIcon}
                    onClick={() => handleCreateTrigger("schedule")}
                  />
                  {hasFeature("hootl_webhooks") &&
                    accessibleWebhookSourceViews.map((view) => (
                      <DropdownMenuItem
                        key={view.sId}
                        label={view.customName}
                        icon={(props) => (
                          <WebhookSourceViewIcon
                            webhookSourceView={view}
                            size="sm"
                          />
                        )}
                        onClick={() => handleCreateTrigger("webhook", view.sId)}
                      />
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            }
            className="py-4"
          />
        ) : (
          <CardGrid>
            {allTriggers.map((item, displayIndex) => (
              <TriggerCard
                key={item.trigger.sId ?? `${item.source}-${item.index}`}
                trigger={item.trigger}
                onRemove={() => handleTriggerRemove(item.trigger, displayIndex)}
                onEdit={() => handleTriggerEdit(item.trigger, displayIndex)}
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
        agentConfigurationId={agentConfigurationId}
        preSelectedWebhookSourceViewSId={
          dialogMode?.type === "add"
            ? dialogMode.webhookSourceViewSId
            : undefined
        }
      />
    </AgentBuilderSectionContainer>
  );
}
