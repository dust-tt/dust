import {
  BoltIcon,
  Button,
  CardGrid,
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
import { TriggerCard } from "@app/components/agent_builder/triggers/TriggerCard";
import type { SheetMode } from "@app/components/agent_builder/triggers/TriggerViewsSheet";
import { TriggerViewsSheet } from "@app/components/agent_builder/triggers/TriggerViewsSheet";
import { useSendNotification } from "@app/hooks/useNotification";
import { useWebhookSourceViewsFromSpaces } from "@app/lib/swr/webhook_source";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

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
  const { getValues, setValue, control } =
    useFormContext<AgentBuilderFormData>();

  // We have to pass down this `append` rather than useFieldArray in the child component for the
  // triggersToCreate to be updated here; this is specific to arrays in react-hook-form.
  const {
    fields: triggersToCreate,
    remove: removeTriggerToCreate,
    append: appendTriggerToCreate,
  } = useFieldArray<AgentBuilderFormData, "triggersToCreate">({
    control,
    name: "triggersToCreate",
  });

  const {
    fields: triggersToUpdate,
    remove: removeTriggerToUpdate,
    append: appendTriggerToUpdate,
  } = useFieldArray<AgentBuilderFormData, "triggersToUpdate">({
    control,
    name: "triggersToUpdate",
  });

  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

  const sendNotification = useSendNotification();
  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);

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

  const handleAddTriggersClick = () => {
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
          <Button
            label="Add triggers"
            type="button"
            icon={BoltIcon}
            onClick={handleAddTriggersClick}
          />
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
              <Button
                label="Add triggers"
                type="button"
                icon={BoltIcon}
                onClick={handleAddTriggersClick}
              />
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
                onEdit={() => handleTriggerEdit(item.trigger)}
              />
            ))}
          </CardGrid>
        )}
      </div>

      <TriggerViewsSheet
        owner={owner}
        mode={sheetMode}
        onModeChange={setSheetMode}
        webhookSourceViews={accessibleWebhookSourceViews}
        agentConfigurationId={agentConfigurationId}
        onAppendTriggerToCreate={appendTriggerToCreate}
        onAppendTriggerToUpdate={appendTriggerToUpdate}
      />
    </AgentBuilderSectionContainer>
  );
}
