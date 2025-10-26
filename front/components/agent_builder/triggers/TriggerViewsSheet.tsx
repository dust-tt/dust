import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@dust-tt/sparkle";
import React, { useCallback, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { ScheduleEdition } from "@app/components/agent_builder/triggers/schedule/ScheduleEdition";
import { TriggerSelectionPage } from "@app/components/agent_builder/triggers/TriggerSelectionPage";
import { WebhookEdition } from "@app/components/agent_builder/triggers/webhook/WebhookEdition";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";

export type SheetMode =
  | { type: "add" }
  | {
      type: "edit";
      trigger: AgentBuilderTriggerType;
      index: number;
      webhookSourceView: WebhookSourceViewType | null;
    };

interface TriggerViewsSheetProps {
  owner: LightWorkspaceType;
  mode: SheetMode | null;
  onModeChange: (mode: SheetMode | null) => void;
  webhookSourceViews: WebhookSourceViewType[];
  agentConfigurationId: string | null;
}

export function TriggerViewsSheet({
  owner,
  mode,
  onModeChange,
  webhookSourceViews,
  agentConfigurationId,
}: TriggerViewsSheetProps) {
  const { control } = useFormContext<AgentBuilderFormData>();

  const { append: appendTriggerToCreate, update: updateTriggerToCreate } =
    useFieldArray({
      control,
      name: "triggersToCreate",
    });

  const { append: appendTriggerToUpdate } = useFieldArray({
    control,
    name: "triggersToUpdate",
  });

  const [scheduleEditionState, setScheduleEditionState] = useState<{
    trigger: AgentBuilderScheduleTriggerType | null;
    index: number | null;
  } | null>(null);

  const [webhookEditionState, setWebhookEditionState] = useState<{
    trigger: AgentBuilderWebhookTriggerType | null;
    index: number | null;
    webhookSourceView: WebhookSourceViewType | null;
  } | null>(null);

  const isSelectionSheetOpen = mode?.type === "add";

  const handleSelectionSheetClose = useCallback(() => {
    onModeChange(null);
  }, [onModeChange]);

  const handleScheduleSelect = useCallback(() => {
    setScheduleEditionState({ trigger: null, index: null });
    onModeChange(null);
  }, [onModeChange]);

  const handleWebhookSelect = useCallback(
    (webhookSourceView: WebhookSourceViewType) => {
      setWebhookEditionState({
        trigger: null,
        index: null,
        webhookSourceView,
      });
      onModeChange(null);
    },
    [onModeChange]
  );

  const handleScheduleSave = useCallback(
    (trigger: AgentBuilderScheduleTriggerType) => {
      if (scheduleEditionState?.index) {
        if (scheduleEditionState.trigger?.sId) {
          appendTriggerToUpdate(trigger);
        } else {
          updateTriggerToCreate(scheduleEditionState.index, trigger);
        }
      } else {
        appendTriggerToCreate(trigger);
      }
      setScheduleEditionState(null);
    },
    [
      scheduleEditionState,
      appendTriggerToCreate,
      appendTriggerToUpdate,
      updateTriggerToCreate,
    ]
  );

  const handleWebhookSave = useCallback(
    (trigger: AgentBuilderWebhookTriggerType) => {
      if (webhookEditionState?.index) {
        if (webhookEditionState.trigger?.sId) {
          appendTriggerToUpdate(trigger);
        } else {
          updateTriggerToCreate(webhookEditionState.index, trigger);
        }
      } else {
        appendTriggerToCreate(trigger);
      }
      setWebhookEditionState(null);
    },
    [
      webhookEditionState,
      appendTriggerToCreate,
      appendTriggerToUpdate,
      updateTriggerToCreate,
    ]
  );

  const handleScheduleClose = useCallback(() => {
    setScheduleEditionState(null);
  }, []);

  const handleWebhookClose = useCallback(() => {
    setWebhookEditionState(null);
  }, []);

  if (mode?.type === "edit") {
    if (mode.trigger.kind === "schedule") {
      if (scheduleEditionState === null) {
        setScheduleEditionState({
          trigger: mode.trigger,
          index: mode.index,
        });
        onModeChange(null);
      }
    } else if (mode.trigger.kind === "webhook") {
      if (webhookEditionState === null) {
        setWebhookEditionState({
          trigger: mode.trigger,
          index: mode.index,
          webhookSourceView: mode.webhookSourceView,
        });
        onModeChange(null);
      }
    }
  }

  return (
    <>
      <Sheet
        open={isSelectionSheetOpen}
        onOpenChange={(open) => !open && handleSelectionSheetClose()}
      >
        <SheetContent size="lg">
          <SheetHeader>
            <SheetTitle>Add triggers</SheetTitle>
          </SheetHeader>
          <TriggerSelectionPage
            onScheduleSelect={handleScheduleSelect}
            onWebhookSelect={handleWebhookSelect}
            webhookSourceViews={webhookSourceViews}
          />
        </SheetContent>
      </Sheet>

      <ScheduleEdition
        owner={owner}
        trigger={scheduleEditionState?.trigger ?? null}
        isOpen={scheduleEditionState !== null}
        onClose={handleScheduleClose}
        onSave={handleScheduleSave}
      />

      <WebhookEdition
        owner={owner}
        trigger={webhookEditionState?.trigger ?? null}
        isOpen={webhookEditionState !== null}
        onClose={handleWebhookClose}
        onSave={handleWebhookSave}
        agentConfigurationId={agentConfigurationId}
        webhookSourceView={webhookEditionState?.webhookSourceView ?? null}
      />
    </>
  );
}
