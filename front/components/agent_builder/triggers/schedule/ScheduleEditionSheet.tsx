import {
  ContentMessage,
  Input,
  Label,
  Separator,
  SliderToggle,
  TextArea,
} from "@dust-tt/sparkle";
import React from "react";
import { useController, useFormContext } from "react-hook-form";

import type { AgentBuilderScheduleTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ScheduleEditionScheduler } from "@app/components/agent_builder/triggers/schedule/ScheduleEditionScheduler";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import type { LightWorkspaceType } from "@app/types";

interface ScheduleEditionNameInputProps {
  isEditor: boolean;
}

function ScheduleEditionNameInput({ isEditor }: ScheduleEditionNameInputProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field,
    fieldState: { error },
  } = useController({ control, name: "schedule.name" });

  return (
    <div className="flex-1 space-y-1">
      <Label htmlFor="trigger-name">Name</Label>
      <Input
        id="trigger-name"
        placeholder="Enter trigger name"
        disabled={!isEditor}
        {...field}
        isError={!!error}
        message={error?.message}
        messageStatus="error"
      />
    </div>
  );
}

interface ScheduleEditionStatusToggleProps {
  isEditor: boolean;
}

function ScheduleEditionStatusToggle({
  isEditor,
}: ScheduleEditionStatusToggleProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field: { value: enabled, onChange: setEnabled },
  } = useController({ control, name: "schedule.enabled" });

  return (
    <div className="space-y-1">
      <Label>Status</Label>
      <div className="flex flex-row items-center gap-2">
        <span className="w-16">{enabled ? "Enabled" : "Disabled"}</span>
        <SliderToggle
          size="xs"
          disabled={!isEditor}
          selected={enabled}
          onClick={() => setEnabled(!enabled)}
        />
      </div>
    </div>
  );
}

interface ScheduleEditionMessageInputProps {
  isEditor: boolean;
}

function ScheduleEditionMessageInput({
  isEditor,
}: ScheduleEditionMessageInputProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const { field } = useController({ control, name: "schedule.customPrompt" });

  return (
    <div className="space-y-1">
      <Label htmlFor="schedule-custom-prompt">Message (optional)</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Message for the agent when the trigger runs.
      </p>
      <TextArea
        id="schedule-custom-prompt"
        minRows={4}
        disabled={!isEditor}
        {...field}
      />
    </div>
  );
}

interface ScheduleEditionSheetContentProps {
  owner: LightWorkspaceType;
  trigger: AgentBuilderScheduleTriggerType | null;
  isEditor: boolean;
}

export function ScheduleEditionSheetContent({
  owner,
  trigger,
  isEditor,
}: ScheduleEditionSheetContentProps) {
  return (
    <>
      {trigger && !isEditor && (
        <ContentMessage variant="info">
          You cannot edit this schedule. It is managed by{" "}
          <span className="font-semibold">
            {trigger.editorName ?? "another user"}
          </span>
          .
        </ContentMessage>
      )}
      <div className="space-y-8">
        {" "}
        <div className="flex flex-row items-center justify-between gap-4">
          <ScheduleEditionNameInput isEditor={isEditor} />
          <ScheduleEditionStatusToggle isEditor={isEditor} />
        </div>
        <ScheduleEditionScheduler isEditor={isEditor} owner={owner} />
        <Separator />
        <ScheduleEditionMessageInput isEditor={isEditor} />
      </div>
    </>
  );
}
