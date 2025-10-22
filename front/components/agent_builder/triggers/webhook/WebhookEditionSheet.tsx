import {
  Button,
  Checkbox,
  CollapsibleComponent,
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
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { RecentWebhookRequests } from "@app/components/agent_builder/triggers/RecentWebhookRequests";
import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";
import type { WebhookFormValues } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import { useDebounce } from "@app/hooks/useDebounce";
import { useWebhookFilterGenerator } from "@app/lib/swr/agent_triggers";
import type { LightWorkspaceType } from "@app/types";
import { normalizeError } from "@app/types";
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
    field: { value, onChange },
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
          selected={value}
          onClick={() => onChange(!value)}
        />
        {value
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

interface WebhookEditionFiltersProps {
  isEditor: boolean;
  webhookSourceView: WebhookSourceViewType | null;
  selectedPreset: PresetWebhook | null;
  availableEvents: WebhookEvent[];
  selectedEventSchema: WebhookEvent | null;
  workspace: LightWorkspaceType;
}

function WebhookEditionFilters({
  isEditor,
  webhookSourceView,
  selectedPreset,
  availableEvents,
  selectedEventSchema,
  workspace,
}: WebhookEditionFiltersProps) {
  const {
    register,
    formState,
    setError,
    control,
    setValue,
    getValues,
    getFieldState,
  } = useFormContext<WebhookFormValues>();
  const selectedEvent = useWatch({ control, name: "event" });
  const formFilter = useWatch({ control, name: "filter" });
  const { error: filterError } = getFieldState("filter", formState);

  const [filterGenerationStatus, setFilterGenerationStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [filterErrorMessage, setFilterErrorMessage] = useState<string | null>(
    null
  );

  const generateFilter = useWebhookFilterGenerator({ workspace });

  const {
    inputValue: naturalDescription,
    debouncedValue: debouncedDescription,
    isDebouncing,
    setValue: setNaturalDescription,
  } = useDebounce("", { delay: 500, minLength: 10 });

  // Initialize naturalDescription from form on mount
  useEffect(() => {
    const initialValue = getValues("naturalDescription");
    if (initialValue) {
      setNaturalDescription(initialValue);
    }
  }, [getValues, setNaturalDescription]);

  // Update form field when naturalDescription changes
  const handleNaturalDescriptionChange = (value: string) => {
    setNaturalDescription(value);
    setValue("naturalDescription", value);
  };

  useEffect(() => {
    if (isDebouncing) {
      setFilterGenerationStatus("loading");
    }
  }, [isDebouncing]);

  useEffect(() => {
    if (!debouncedDescription || !selectedEventSchema) {
      if (!debouncedDescription) {
        setFilterGenerationStatus("idle");
        setFilterErrorMessage(null);
      }
      return;
    }

    const generateFilterAsync = async () => {
      setFilterGenerationStatus("loading");
      try {
        const result = await generateFilter({
          naturalDescription: debouncedDescription,
          eventSchema: selectedEventSchema.fields,
        });
        setValue("filter", result.filter);
        setFilterGenerationStatus("idle");
        setFilterErrorMessage(null);
      } catch (error) {
        setFilterGenerationStatus("error");
        setFilterErrorMessage(
          `Error generating filter: ${normalizeError(error).message}`
        );
      }
    };

    void generateFilterAsync();
  }, [debouncedDescription, selectedEventSchema, generateFilter, setValue]);

  const filterGenerationResult = useMemo(() => {
    switch (filterGenerationStatus) {
      case "idle":
        if (formFilter) {
          return (
            <CollapsibleComponent
              rootProps={{ defaultOpen: true }}
              triggerChildren={
                <Label className="cursor-pointer">Current filter</Label>
              }
              contentChildren={<TriggerFilterRenderer data={formFilter} />}
            />
          );
        }
        return null;
      case "loading":
        return (
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Generating filter...
            </span>
          </div>
        );
      case "error":
        return (
          <p className="text-sm text-warning">
            {filterErrorMessage ??
              "Unable to generate filter. Please try rephrasing."}
          </p>
        );
      default:
        return null;
    }
  }, [filterGenerationStatus, filterErrorMessage, formFilter]);

  return (
    <>
      {selectedPreset && availableEvents.length > 0 && (
        <>
          <Label htmlFor="trigger-filter-description">
            Filter Description (optional)
          </Label>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Describe in natural language the conditions under which the agent
            should trigger. Will always trigger if left empty.
          </p>
          <TextArea
            id="trigger-filter-description"
            placeholder='e.g. "New pull requests that changes more than 500 lines of code, or have the `auto-review` label."'
            rows={3}
            value={naturalDescription}
            disabled={!isEditor}
            onChange={(e) => {
              if (!selectedEvent || !selectedPreset) {
                setError("event", {
                  type: "manual",
                  message: "Please select an event first",
                });
                return;
              }

              handleNaturalDescriptionChange(e.target.value);
            }}
          />
        </>
      )}

      {webhookSourceView?.kind === "custom" && (
        <>
          <Label htmlFor="trigger-filter-description">
            Filter Expression (optional)
          </Label>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Enter a filter that will be used to filter the webhook payload JSON.
            Will always trigger if left empty.
          </p>
          <TextArea
            id="trigger-filter-description"
            placeholder={
              'example:\n\n(and\n  (eq "action" "opened")\n  (exists "pull_request")\n)'
            }
            rows={6}
            {...register("filter")}
            disabled={!isEditor}
            error={formState.errors.filter?.message}
          />
        </>
      )}

      <div className="pt-2">{filterGenerationResult}</div>
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
  const form = useFormContext<WebhookFormValues>();

  const selectedEvent = useWatch({
    control: form.control,
    name: "event",
  });

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

  const selectedEventSchema = useMemo<WebhookEvent | null>(() => {
    if (!selectedEvent || !selectedPreset) {
      return null;
    }

    return (
      selectedPreset.events.find((event) => event.name === selectedEvent) ??
      null
    );
  }, [selectedEvent, selectedPreset]);

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
                selectedEventSchema={selectedEventSchema}
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
            disabled: form.formState.isSubmitting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
