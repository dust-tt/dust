import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Checkbox,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Input,
  Label,
  Separator,
  SliderToggle,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { RecentWebhookRequests } from "@app/components/agent_builder/triggers/RecentWebhookRequests";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { WebhookEditionFilters } from "@app/components/agent_builder/triggers/webhook/WebhookEditionFilters";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";
import Link from "next/link";

interface WebhookEditionNameInputProps {
  isEditor: boolean;
}

function WebhookEditionNameInput({ isEditor }: WebhookEditionNameInputProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field,
    fieldState: { error },
  } = useController({ control, name: "webhook.name" });

  return (
    <div className="flex-grow space-y-1">
      <Label htmlFor="webhook-name">Name</Label>
      <Input
        id="webhook-name"
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

interface WebhookEditionStatusToggleProps {
  isEditor: boolean;
}

function WebhookEditionStatusToggle({
  isEditor,
}: WebhookEditionStatusToggleProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field: { value: enabled, onChange: setEnabled },
  } = useController({ control, name: "webhook.enabled" });

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

interface WebhookEditionExecutionLimitProps {
  isEditor: boolean;
}

function WebhookEditionExecutionLimit({
  isEditor,
}: WebhookEditionExecutionLimitProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field: { value: executionLimit, onChange: setExecutionLimit },
  } = useController({
    control,
    name: "webhook.executionPerDayLimitOverride",
  });

  const limitOptions = [
    { label: "10/day", value: 10 },
    { label: "25/day", value: 25 },
    { label: "50/day", value: 50 },
  ];

  return (
    <div className="flex flex-col space-y-1">
      <Label htmlFor="execution-limit">Execution limit</Label>
      <div className="pb-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
        <p>
          Maximum number of times this trigger can execute per hour. This is
          smoothed out over a 24 hour period.
        </p>
        <p className="font-semibold">
          <Link
            href="https://docs.dust.tt/update/docs/rate-limiting#/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Learn more
          </Link>{" "}
          about webhook trigger rate limiting.
        </p>
      </div>
      <ButtonsSwitchList
        defaultValue={executionLimit.toString()}
        className="w-fit"
      >
        {limitOptions.map((option) => (
          <ButtonsSwitch
            key={option.value}
            value={option.value.toString()}
            label={option.label}
            onClick={() => setExecutionLimit(option.value)}
            disabled={!isEditor}
          />
        ))}
      </ButtonsSwitchList>
    </div>
  );
}

interface WebhookEditionEventSelectorProps {
  isEditor: boolean;
  selectedPreset: PresetWebhook | null;
  availableEvents: WebhookEvent[];
}

function WebhookEditionEventSelector({
  isEditor,
  selectedPreset,
  availableEvents,
}: WebhookEditionEventSelectorProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field: { value: selectedEvent, onChange: setSelectedEvent },
    fieldState: { error },
  } = useController({ control, name: "webhook.event" });

  if (!selectedPreset || availableEvents.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col space-y-1">
      <Label htmlFor="webhook-event">Listen for</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        External event that will trigger a run of this agent.
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id="webhook-event"
            variant="outline"
            isSelect
            className="w-fit"
            disabled={!isEditor}
            label={
              availableEvents.find((e) => e.value === selectedEvent)?.name ??
              "Select event"
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel label="Select" />
          {availableEvents.map((event) => (
            <DropdownMenuItem
              key={event.value}
              label={event.name}
              disabled={!isEditor}
              onClick={() => setSelectedEvent(event.value)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p className="text-sm text-warning">{error.message}</p>}
    </div>
  );
}

interface WebhookEditionIncludePayloadProps {
  isEditor: boolean;
}

function WebhookEditionIncludePayload({
  isEditor,
}: WebhookEditionIncludePayloadProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const {
    field: { value: includePayload, onChange: setIncludePayload },
  } = useController({ control, name: "webhook.includePayload" });

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        size="sm"
        checked={includePayload}
        onClick={() => setIncludePayload(!includePayload)}
        disabled={!isEditor}
      />
      <Label>Include webhook payload</Label>
    </div>
  );
}

interface WebhookEditionMessageInputProps {
  isEditor: boolean;
}

function WebhookEditionMessageInput({
  isEditor,
}: WebhookEditionMessageInputProps) {
  const { control } = useFormContext<TriggerViewsSheetFormValues>();
  const { field } = useController({ control, name: "webhook.customPrompt" });

  return (
    <div className="space-y-1">
      <Label htmlFor="webhook-prompt">Message (optional)</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Message for the agent when the trigger runs.
      </p>
      <TextArea
        id="webhook-prompt"
        minRows={4}
        disabled={!isEditor}
        {...field}
      />
    </div>
  );
}

interface WebhookEditionSheetContentProps {
  owner: LightWorkspaceType;
  trigger: AgentBuilderWebhookTriggerType | null;
  agentConfigurationId: string | null;
  webhookSourceView: WebhookSourceViewType | null;
  isEditor: boolean;
}

export function WebhookEditionSheetContent({
  owner,
  trigger,
  agentConfigurationId,
  webhookSourceView,
  isEditor,
}: WebhookEditionSheetContentProps) {
  const selectedPreset = useMemo((): PresetWebhook | null => {
    if (!webhookSourceView || webhookSourceView.provider === null) {
      return null;
    }
    return WEBHOOK_PRESETS[webhookSourceView.provider];
  }, [webhookSourceView]);

  const availableEvents = useMemo(() => {
    if (!selectedPreset || !webhookSourceView) {
      return [];
    }

    return selectedPreset.events.filter((event) =>
      webhookSourceView.subscribedEvents.includes(event.value)
    );
  }, [selectedPreset, webhookSourceView]);

  return (
    <>
      {trigger && !isEditor && (
        <ContentMessage variant="info">
          You cannot edit this trigger. It is managed by{" "}
          <span className="font-semibold">
            {trigger.editorName ?? "another user"}
          </span>
          .
        </ContentMessage>
      )}
      <div className="space-y-8">
        <div className="flex flex-row items-center justify-between gap-4">
          <WebhookEditionNameInput isEditor={isEditor} />
          <WebhookEditionStatusToggle isEditor={isEditor} />
        </div>

        <WebhookEditionEventSelector
          isEditor={isEditor}
          selectedPreset={selectedPreset}
          availableEvents={availableEvents}
        />

        <WebhookEditionFilters
          isEditor={isEditor}
          webhookSourceView={webhookSourceView}
          selectedPreset={selectedPreset}
          availableEvents={availableEvents}
          workspace={owner}
        />

        <Separator />

        <div className="space-y-4">
          <WebhookEditionMessageInput isEditor={isEditor} />
          <WebhookEditionIncludePayload isEditor={isEditor} />
        </div>

        <Separator />

        <WebhookEditionExecutionLimit isEditor={isEditor} />

        {trigger && (
          <div className="space-y-1">
            <RecentWebhookRequests
              owner={owner}
              agentConfigurationId={agentConfigurationId}
              trigger={trigger}
            />
          </div>
        )}
      </div>
    </>
  );
}
