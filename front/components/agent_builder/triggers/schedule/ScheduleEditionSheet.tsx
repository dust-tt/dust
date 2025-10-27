import {
  ContentMessage,
  Input,
  Label,
  SliderToggle,
  TextArea,
} from "@dust-tt/sparkle";
import React from "react";
import { useController, useFormContext } from "react-hook-form";

import type { AgentBuilderScheduleTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { ScheduleFormValues } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { ScheduleEditionScheduler } from "@app/components/agent_builder/triggers/schedule/ScheduleEditionScheduler";
import type { LightWorkspaceType } from "@app/types";

interface ScheduleEditionNameInputProps {
  isEditor: boolean;
}

function ScheduleEditionNameInput({ isEditor }: ScheduleEditionNameInputProps) {
  const { control } = useFormContext<ScheduleFormValues>();
  const {
    field,
    fieldState: { error },
  } = useController({ control, name: "name" });

  return (
    <div className="space-y-1">
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
  const { control } = useFormContext<ScheduleFormValues>();
  const {
    field: { value: enabled, onChange: setEnabled },
  } = useController({ control, name: "enabled" });

  return (
    <div className="space-y-1">
      <Label>Status</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        When disabled, the trigger will not run.
      </p>
      <div className="flex flex-row items-center gap-2">
        <SliderToggle
          size="xs"
          disabled={!isEditor}
          selected={enabled}
          onClick={() => setEnabled(!enabled)}
        />
        {enabled
          ? "The trigger is currently enabled"
          : "The trigger is currently disabled"}
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
  const { control } = useFormContext<ScheduleFormValues>();
  const { field } = useController({ control, name: "customPrompt" });

  return (
    <div className="space-y-1">
      <Label htmlFor="schedule-custom-prompt">Message (Optional)</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Add context or instructions for the agent when triggered.
      </p>
      <TextArea
        id="schedule-custom-prompt"
        placeholder='e.g. "Provide a summary of the latest sales figures."'
        rows={4}
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
      <div className="space-y-4">
        <ScheduleEditionNameInput isEditor={isEditor} />

        <ScheduleEditionStatusToggle isEditor={isEditor} />

        <ScheduleEditionScheduler isEditor={isEditor} owner={owner} />

        <ScheduleEditionMessageInput isEditor={isEditor} />
      </div>
    </>
  );
}
