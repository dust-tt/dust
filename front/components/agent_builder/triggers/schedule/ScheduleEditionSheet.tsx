import type { AgentBuilderScheduleTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ScheduleEditionScheduler } from "@app/components/agent_builder/triggers/schedule/ScheduleEditionScheduler";
import { TriggerPodSelector } from "@app/components/agent_builder/triggers/TriggerPodSelector";
import { TriggerPoolSelector } from "@app/components/agent_builder/triggers/TriggerPoolSelector";
import { TriggerStatusToggle } from "@app/components/agent_builder/triggers/TriggerStatusToggle";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ContentMessage,
  Input,
  Label,
  Separator,
  TextArea,
} from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";
import { useController, useFormContext } from "react-hook-form";

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
      <p className="text-sm text-muted-foreground">
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

interface ScheduleEditionPodSelectorProps {
  isEditor: boolean;
  owner: LightWorkspaceType;
}

function ScheduleEditionPodSelector({
  isEditor,
  owner,
}: ScheduleEditionPodSelectorProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const { field } = useController({ control, name: "schedule.spaceId" });

  return (
    <div className="space-y-1">
      <Label>Where to create this conversation? (optional) </Label>
      <p className="text-sm text-muted-foreground">
        Run this trigger's conversation inside a Pod instead.
      </p>
      <TriggerPodSelector
        owner={owner}
        value={field.value}
        onChange={field.onChange}
        disabled={!isEditor}
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
          <TriggerStatusToggle name="schedule.status" isEditor={isEditor} />
        </div>
        <ScheduleEditionScheduler isEditor={isEditor} owner={owner} />
        <Separator />
        <ScheduleEditionMessageInput isEditor={isEditor} />
        <TriggerPoolSelector
          name="schedule.executionMode"
          currentExecutionMode={trigger?.executionMode ?? null}
          isEditor={isEditor}
        />
        <Separator />
        <ScheduleEditionPodSelector isEditor={isEditor} owner={owner} />
      </div>
    </>
  );
}
