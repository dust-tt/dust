import React, { useCallback, useEffect, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderScheduleTriggerType,
  AgentBuilderTriggerType,
  AgentBuilderWebhookTriggerType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { ScheduleEdition } from "@app/components/agent_builder/triggers/schedule/ScheduleEdition";
import { TriggerSelectionSheet } from "@app/components/agent_builder/triggers/TriggerSelectionSheet";
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

  const [editingTrigger, setEditingTrigger] = useState<{
    trigger: AgentBuilderTriggerType;
    index: number;
  } | null>(null);

  const [selectedWebhookSourceView, setSelectedWebhookSourceView] =
    useState<WebhookSourceViewType | null>(null);

  const [currentSheet, setCurrentSheet] = useState<
    "selection" | "schedule" | "webhook" | null
  >(null);

  // Handle mode changes from parent
  useEffect(() => {
    if (mode?.type === "add") {
      setCurrentSheet("selection");
      setEditingTrigger(null);
      setSelectedWebhookSourceView(null);
    } else if (mode?.type === "edit") {
      setEditingTrigger({ trigger: mode.trigger, index: mode.index });
      if (mode.trigger.kind === "schedule") {
        setCurrentSheet("schedule");
      } else {
        setSelectedWebhookSourceView(mode.webhookSourceView);
        setCurrentSheet("webhook");
      }
    } else {
      setCurrentSheet(null);
      setEditingTrigger(null);
      setSelectedWebhookSourceView(null);
    }
  }, [mode]);

  const handleScheduleSelect = useCallback(() => {
    setEditingTrigger(null);
    setCurrentSheet("schedule");
  }, []);

  const handleWebhookSelect = useCallback(
    (webhookSourceView: WebhookSourceViewType) => {
      setEditingTrigger(null);
      setSelectedWebhookSourceView(webhookSourceView);
      setCurrentSheet("webhook");
    },
    []
  );

  const handleCloseAll = useCallback(() => {
    setCurrentSheet(null);
    setEditingTrigger(null);
    setSelectedWebhookSourceView(null);
    onModeChange(null);
  }, [onModeChange]);

  const handleScheduleSave = useCallback(
    (triggerData: AgentBuilderScheduleTriggerType) => {
      if (editingTrigger) {
        if (editingTrigger.trigger.sId) {
          appendTriggerToUpdate(triggerData);
        } else {
          updateTriggerToCreate(editingTrigger.index, triggerData);
        }
      } else {
        appendTriggerToCreate(triggerData);
      }

      handleCloseAll();
    },
    [
      editingTrigger,
      appendTriggerToUpdate,
      updateTriggerToCreate,
      appendTriggerToCreate,
      handleCloseAll,
    ]
  );

  const handleWebhookSave = useCallback(
    (triggerData: AgentBuilderWebhookTriggerType) => {
      if (editingTrigger) {
        if (editingTrigger.trigger.sId) {
          appendTriggerToUpdate(triggerData);
        } else {
          updateTriggerToCreate(editingTrigger.index, triggerData);
        }
      } else {
        appendTriggerToCreate(triggerData);
      }

      handleCloseAll();
    },
    [
      editingTrigger,
      appendTriggerToUpdate,
      updateTriggerToCreate,
      appendTriggerToCreate,
      handleCloseAll,
    ]
  );

  return (
    <>
      <TriggerSelectionSheet
        isOpen={currentSheet === "selection"}
        onClose={handleCloseAll}
        onScheduleSelect={handleScheduleSelect}
        onWebhookSelect={handleWebhookSelect}
        webhookSourceViews={webhookSourceViews}
      />

      <ScheduleEdition
        owner={owner}
        trigger={
          editingTrigger?.trigger.kind === "schedule"
            ? editingTrigger.trigger
            : null
        }
        isOpen={currentSheet === "schedule"}
        onClose={handleCloseAll}
        onSave={handleScheduleSave}
      />

      <WebhookEdition
        owner={owner}
        trigger={
          editingTrigger?.trigger.kind === "webhook"
            ? editingTrigger.trigger
            : null
        }
        webhookSourceView={selectedWebhookSourceView}
        agentConfigurationId={agentConfigurationId}
        isOpen={currentSheet === "webhook"}
        onClose={handleCloseAll}
        onSave={handleWebhookSave}
      />
    </>
  );
}
