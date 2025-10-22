import {
  Button,
  Checkbox,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Input,
  Label,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SliderToggle,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useMemo } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { RecentWebhookRequests } from "@app/components/agent_builder/triggers/RecentWebhookRequests";
import { WebhookEditionFilters } from "@app/components/agent_builder/triggers/webhook/WebhookEditionFilters";
import type { WebhookFormValues } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

interface WebhookEditionNameInputProps {
  isEditor: boolean;
}

function WebhookEditionNameInput({ isEditor }: WebhookEditionNameInputProps) {
  const { control } = useFormContext<WebhookFormValues>();
  const {
    field,
    fieldState: { error },
  } = useController({ control, name: "name" });

  return (
    <>
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
    </>
  );
}

interface WebhookEditionStatusToggleProps {
  isEditor: boolean;
}

function WebhookEditionStatusToggle({
  isEditor,
}: WebhookEditionStatusToggleProps) {
  const { control } = useFormContext<WebhookFormValues>();
  const {
    field: { value: enabled, onChange: setEnabled },
  } = useController({ control, name: "enabled" });

  return (
    <>
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
    </>
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
  const { setValue, control, getFieldState, formState } =
    useFormContext<WebhookFormValues>();
  // Using useWatch + setValue instead of useController to validate with shouldValidate.
  const selectedEvent = useWatch({ control, name: "event" });
  const { error } = getFieldState("event", formState);

  if (!selectedPreset || availableEvents.length === 0) {
    return null;
  }

  return (
    <>
      <Label htmlFor="webhook-event">Event</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Select the event that will trigger this webhook.
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
              selectedEvent
                ? availableEvents.find((e) => e.value === selectedEvent)
                    ?.name ?? "Select event"
                : "Select event"
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel label="Select event" />
          {availableEvents.map((event) => (
            <DropdownMenuItem
              key={event.value}
              label={event.name}
              disabled={!isEditor}
              onClick={() => {
                setValue("event", event.value, {
                  shouldValidate: true,
                });
              }}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p className="text-sm text-warning">{error.message}</p>}
    </>
  );
}

interface WebhookEditionIncludePayloadProps {
  isEditor: boolean;
}

function WebhookEditionIncludePayload({
  isEditor,
}: WebhookEditionIncludePayloadProps) {
  const { control } = useFormContext<WebhookFormValues>();
  const {
    field: { value, onChange },
  } = useController({ control, name: "includePayload" });

  return (
    <>
      <div className="flex flex-col space-y-1">
        <Label>Include payload</Label>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          When enabled, the webhook payload will be included in the agent's
          context.
        </p>
      </div>
      <Checkbox
        size="sm"
        checked={value}
        onClick={() => onChange(!value)}
        disabled={!isEditor}
      />
    </>
  );
}

interface WebhookEditionMessageInputProps {
  isEditor: boolean;
}

function WebhookEditionMessageInput({
  isEditor,
}: WebhookEditionMessageInputProps) {
  const { control } = useFormContext<WebhookFormValues>();
  const { field } = useController({ control, name: "customPrompt" });

  return (
    <>
      <Label htmlFor="trigger-prompt">Message (Optional)</Label>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Add context or instructions for the agent when the trigger runs.
      </p>
      <TextArea
        id="trigger-prompt"
        minRows={4}
        disabled={!isEditor}
        {...field}
      />
    </>
  );
}

interface WebhookEditionSheetProps {
  owner: LightWorkspaceType;
  trigger: AgentBuilderWebhookTriggerType | null;
  isOpen: boolean;
  onCancel: () => void;
  onClose: () => void;
  onSave: (trigger: AgentBuilderWebhookTriggerType) => void;
  agentConfigurationId: string | null;
  webhookSourceView: WebhookSourceViewType | null;
  isEditor: boolean;
}

export function WebhookEditionSheet({
  owner,
  trigger,
  isOpen,
  onCancel,
  onClose,
  onSave,
  agentConfigurationId,
  webhookSourceView,
  isEditor,
}: WebhookEditionSheetProps) {
  const {
    formState: { isSubmitting },
  } = useFormContext<WebhookFormValues>();

  const selectedPreset = useMemo((): PresetWebhook | null => {
    if (!webhookSourceView || webhookSourceView.kind === "custom") {
      return null;
    }
    return WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[webhookSourceView.kind];
  }, [webhookSourceView]);

  const availableEvents = useMemo(() => {
    if (!selectedPreset || !webhookSourceView) {
      return [];
    }

    return selectedPreset.events.filter((event) =>
      webhookSourceView.subscribedEvents.includes(event.value)
    );
  }, [selectedPreset, webhookSourceView]);

  const handleClose = () => {
    onCancel();
    onClose();
  };

  const modalTitle = useMemo(() => {
    if (trigger) {
      return isEditor ? "Edit Webhook" : "View Webhook";
    }
    if (webhookSourceView) {
      return `Create ${webhookSourceView.customName} Trigger`;
    }
    return "Create Webhook";
  }, [trigger, isEditor, webhookSourceView]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>{modalTitle}</SheetTitle>
        </SheetHeader>

        <SheetContainer>
          {trigger && !isEditor && (
            <ContentMessage variant="info">
              You cannot edit this trigger. It is managed by{" "}
              <span className="font-semibold">
                {trigger.editorName ?? "another user"}
              </span>
              .
            </ContentMessage>
          )}
          <div className="space-y-5">
            <div className="space-y-1">
              <WebhookEditionNameInput isEditor={isEditor} />
            </div>

            <div className="space-y-1">
              <WebhookEditionStatusToggle isEditor={isEditor} />
            </div>

            <div className="flex flex-col space-y-1">
              <WebhookEditionEventSelector
                isEditor={isEditor}
                selectedPreset={selectedPreset}
                availableEvents={availableEvents}
              />
            </div>

            <div className="space-y-1">
              <WebhookEditionFilters
                isEditor={isEditor}
                webhookSourceView={webhookSourceView}
                selectedPreset={selectedPreset}
                availableEvents={availableEvents}
                workspace={owner}
              />
            </div>

            <div className="flex items-center justify-between">
              <WebhookEditionIncludePayload isEditor={isEditor} />
            </div>

            <div className="space-y-1">
              <WebhookEditionMessageInput isEditor={isEditor} />
            </div>

            {/* Recent Webhook Requests */}
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
        </SheetContainer>

        <SheetFooter
          leftButtonProps={
            isEditor
              ? {
                  label: "Cancel",
                  variant: "outline",
                  onClick: handleClose,
                }
              : undefined
          }
          // TODO(2025-10-22 aubin): fix these labels (Close feels weird).
          rightButtonProps={{
            label: trigger
              ? isEditor
                ? "Update Webhook"
                : "Close"
              : webhookSourceView
                ? `Add ${webhookSourceView.customName} Trigger`
                : "Add Webhook",
            variant: "primary",
            onClick: isEditor ? onSave : handleClose,
            disabled: isSubmitting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
