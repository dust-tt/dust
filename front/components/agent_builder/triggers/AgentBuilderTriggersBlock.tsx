import {
  BoltIcon,
  Button,
  CardGrid,
  EmptyCTA,
  Hoverable,
  Spinner,
} from "@dust-tt/sparkle";
import uniqBy from "lodash/uniqBy";
import React, { useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { TriggerCard } from "@app/components/agent_builder/triggers/TriggerCard";
import type { SheetMode } from "@app/components/agent_builder/triggers/TriggerViewsSheet";
import { TriggerViewsSheet } from "@app/components/agent_builder/triggers/TriggerViewsSheet";
import { useSendNotification } from "@app/hooks/useNotification";
import { useWebhookSourceViewsFromSpaces } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

interface AgentBuilderTriggersBlockProps {
  owner: LightWorkspaceType;
  isTriggersLoading?: boolean;
  agentConfigurationId: string | null;
}

const TEMP_TRIGGER_PREFIX = "temptrg";

export function AgentBuilderTriggersBlock({
  owner,
  isTriggersLoading,
  agentConfigurationId,
}: AgentBuilderTriggersBlockProps) {
  const { getValues, setValue, control } =
    useFormContext<AgentBuilderFormData>();

  // We have to pass down this `append` rather than useFieldArray in the child component for the
  // triggersToCreate to be updated here; this is specific to arrays in react-hook-form.
  const {
    fields: triggersToCreate,
    remove: removeTriggerToCreate,
    append: appendTriggerToCreate,
    update: updateTriggerToCreate,
  } = useFieldArray<AgentBuilderFormData, "triggersToCreate">({
    control,
    name: "triggersToCreate",
  });

  const {
    fields: triggersToUpdate,
    remove: removeTriggerToUpdate,
    append: appendTriggerToUpdate,
    update: updateTriggerToUpdate,
  } = useFieldArray<AgentBuilderFormData, "triggersToUpdate">({
    control,
    name: "triggersToUpdate",
  });

  const sendNotification = useSendNotification();
  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);

  const { spaces } = useSpacesContext();
  const { webhookSourceViews } = useWebhookSourceViewsFromSpaces(owner, spaces);

  const accessibleSpaceIds = useMemo(
    () => new Set(spaces.map((space) => space.sId)),
    [spaces]
  );

  const accessibleWebhookSourceViews = useMemo(
    () =>
      uniqBy(
        webhookSourceViews.filter((view) =>
          accessibleSpaceIds.has(view.spaceId)
        ),
        (view) => view.webhookSource.sId
      ).sort((a, b) => (a.createdAt >= b.createdAt ? -1 : 1)),
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

  const handleAddTrigger = () => {
    setSheetMode({ type: "add" });
  };

  const handleTriggerEdit = (trigger: AgentBuilderTriggerType) => {
    let webhookSourceView: WebhookSourceViewType | null = null;

    if (trigger.kind === "webhook") {
      webhookSourceView =
        accessibleWebhookSourceViews.find(
          (view) => view.sId === trigger.webhookSourceViewSId
        ) ?? null;
    }

    setSheetMode({
      type: "edit",
      trigger,
      webhookSourceView,
    });
  };

  const handleTriggerCreate = (trigger: AgentBuilderTriggerType) => {
    appendTriggerToCreate({
      ...trigger,
      // Assign a temporary sId for frontend identification until it's created on the backend.
      // The sId is needed to be able to update a freshly created trigger, not yet in DB.
      sId: TEMP_TRIGGER_PREFIX + "_" + crypto.randomUUID().slice(0, 8),
    });
  };

  const handleTriggerUpdate = (trigger: AgentBuilderTriggerType) => {
    if (sheetMode?.type !== "edit" || !trigger.sId) {
      appendTriggerToUpdate(trigger);
      return;
    }

    if (trigger.sId?.startsWith(TEMP_TRIGGER_PREFIX)) {
      // We're editing a freshly created trigger,
      // so the update should happen in the create array.
      const index = triggersToCreate.findIndex((t) => t.sId === trigger.sId);
      if (index !== -1) {
        updateTriggerToCreate(index, trigger);
        return;
      }
    }

    const index = triggersToUpdate.findIndex((t) => t.sId === trigger.sId);
    if (index !== -1) {
      updateTriggerToUpdate(index, trigger);
      return;
    }
  };

  const handleTriggerRemove = (
    trigger: AgentBuilderTriggerType,
    displayIndex: number
  ) => {
    const displayItem = allTriggers[displayIndex];

    if (displayItem.source === "create") {
      // Just remove from create array
      removeTriggerToCreate(displayItem.index);
    } else {
      // Has sId, so it exists on backend - mark for deletion
      if (trigger.sId) {
        const currentToDelete = getValues("triggersToDelete");
        setValue("triggersToDelete", [...currentToDelete, trigger.sId]);
      }
      removeTriggerToUpdate(displayItem.index);
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
          Run agents based on events. Need help? Check our&nbsp;
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
          <Button
            label="Add triggers"
            type="button"
            icon={BoltIcon}
            onClick={handleAddTrigger}
          />
        )
      }
    >
      <div className="flex-1">
        {isTriggersLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : allTriggers.length === 0 ? (
          <EmptyCTA
            action={
              <Button
                label="Add triggers"
                type="button"
                icon={BoltIcon}
                onClick={handleAddTrigger}
              />
            }
            className="py-4"
          />
        ) : (
          <CardGrid>
            {allTriggers.map((item, displayIndex) => (
              <TriggerCard
                key={
                  item.trigger.sId
                    ? `card-${item.trigger.sId}`
                    : `${item.source}-${item.index}`
                }
                trigger={item.trigger}
                webhookSourceView={accessibleWebhookSourceViews.find((view) =>
                  item.trigger.kind === "webhook"
                    ? view.sId === item.trigger.webhookSourceViewSId
                    : undefined
                )}
                onRemove={() => handleTriggerRemove(item.trigger, displayIndex)}
                onEdit={() => handleTriggerEdit(item.trigger)}
              />
            ))}
          </CardGrid>
        )}
      </div>

      <TriggerViewsSheet
        owner={owner}
        mode={sheetMode}
        webhookSourceViews={accessibleWebhookSourceViews}
        agentConfigurationId={agentConfigurationId}
        onAppendTriggerToCreate={handleTriggerCreate}
        onAppendTriggerToUpdate={handleTriggerUpdate}
      />
    </AgentBuilderSectionContainer>
  );
}
