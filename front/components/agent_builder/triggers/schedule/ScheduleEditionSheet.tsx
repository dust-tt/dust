import type { AgentBuilderScheduleTriggerType } from "@app/components/agent_builder/agentBuilderFormSchema";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useController, useFormContext } from "react-hook-form";

interface ScheduleEditionNameInputProps {
  isEditor: boolean;
}

function ScheduleEditionNameInput({ isEditor }: ScheduleEditionNameInputProps) {
  const { t } = useLingui();
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field,
    fieldState: { error },
  } = useController({ control, name: "schedule.name" });

  return (
    <div className="flex-1 space-y-1">
      <Label htmlFor="trigger-name">
        <Trans>Name</Trans>
      </Label>
      <Input
        id="trigger-name"
        placeholder={t`Enter trigger name`}
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
      <Label htmlFor="schedule-custom-prompt">
        <Trans>Message (optional)</Trans>
      </Label>
      <p className="text-sm text-muted-foreground">
        <Trans>Message for the agent when the trigger runs.</Trans>
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
      <Label>
        <Trans>Where to create this conversation? (optional)</Trans>
      </Label>
      <p className="text-sm text-muted-foreground">
        <Trans>Run this trigger's conversation inside a Pod instead.</Trans>
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
  const { t } = useLingui();
  const editorName = trigger?.editorName ?? t`another user`;

  return (
    <>
      {trigger && !isEditor && (
        <ContentMessage variant="info">
          <Trans>
            You cannot edit this schedule. It is managed by{" "}
            <span className="font-semibold">{editorName}</span>.
          </Trans>
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
