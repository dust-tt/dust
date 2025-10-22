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
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { RecentWebhookRequests } from "@app/components/agent_builder/triggers/RecentWebhookRequests";
import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";
import { useWebhookFilterGeneration } from "@app/components/agent_builder/triggers/useWebhookFilterGeneration";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useUser } from "@app/lib/swr/user";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";
import type { PresetWebhook } from "@app/types/triggers/webhooks_source_preset";

const webhookFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  enabled: z.boolean().default(true),
  customPrompt: z.string(),
  webhookSourceViewSId: z.string().min(1, "Select a webhook source"),
  event: z.string().optional(),
  filter: z.string().optional(),
  includePayload: z.boolean().default(false),
});

type WebhookFormData = z.infer<typeof webhookFormSchema>;

interface WebhookEditionModalProps {
  owner: LightWorkspaceType;
  trigger?: AgentBuilderWebhookTriggerType;
  isOpen: boolean;
  onClose: () => void;
  onSave: (trigger: AgentBuilderWebhookTriggerType) => void;
  agentConfigurationId: string | null;
  webhookSourceView: WebhookSourceViewType | null;
}

export function WebhookEditionSheet({
  owner,
  trigger,
  isOpen,
  onClose,
  onSave,
  agentConfigurationId,
  webhookSourceView,
}: WebhookEditionModalProps) {
  const { user } = useUser();

  const defaultValues = useMemo(
    (): WebhookFormData => ({
      name: "Webhook Trigger",
      enabled: true,
      customPrompt: "",
      webhookSourceViewSId: webhookSourceView?.sId ?? "",
      event: undefined,
      filter: "",
      includePayload: true,
    }),
    [webhookSourceView?.sId]
  );

  const form = useForm<WebhookFormData>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues,
  });

  const selectedEvent = form.watch("event");
  const includePayload = form.watch("includePayload");

  const isEditor = (trigger?.editor ?? user?.id) === user?.id;

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

  const selectedEventSchema = useMemo(() => {
    if (!selectedEvent || !selectedPreset) {
      return undefined;
    }
    return selectedPreset.events.find((event) => event.name === selectedEvent);
  }, [selectedEvent, selectedPreset]);

  const {
    naturalDescription,
    setNaturalDescription,
    generatedFilter,
    status: filterGenerationStatus,
    errorMessage: filterErrorMessage,
  } = useWebhookFilterGeneration({
    workspace: owner,
    eventSchema: selectedEventSchema,
  });

  // Sync generated filter to form.
  useEffect(() => {
    if (generatedFilter) {
      form.setValue("filter", generatedFilter);
    }
  }, [generatedFilter, form]);

  // Reset natural description when modal closes
  useEffect(() => {
    if (!isOpen) {
      form.reset(defaultValues);
      setNaturalDescription("");
      return;
    }

    if (!trigger) {
      form.reset(defaultValues);
      setNaturalDescription("");
      return;
    }

    const includePayload = trigger.configuration.includePayload;
    const event = trigger.configuration.event;
    const filter = trigger.configuration.filter ?? "";

    form.reset({
      name: trigger.name,
      enabled: trigger.enabled,
      customPrompt: trigger.customPrompt ?? "",
      webhookSourceViewSId: trigger.webhookSourceViewSId ?? "",
      event,
      filter,
      includePayload,
    });

    // Restore natural description if it exists
    if (trigger.naturalLanguageDescription) {
      setNaturalDescription(trigger.naturalLanguageDescription);
    } else {
      setNaturalDescription("");
    }
  }, [defaultValues, form, isOpen, trigger, setNaturalDescription]);

  const handleClose = () => {
    // Reset natural description to clear the filter generation status
    setNaturalDescription("");
    form.reset(defaultValues);
    onClose();
  };

  const onSubmit = (data: WebhookFormData) => {
    if (!user) {
      return;
    }

    // Validate that event is selected for preset webhooks (not custom)
    if (
      webhookSourceView &&
      webhookSourceView.kind !== "custom" &&
      selectedPreset &&
      availableEvents.length > 0 &&
      !data.event
    ) {
      form.setError("event", {
        type: "manual",
        message: "Please select an event",
      });
      return;
    }

    const editor = trigger?.editor ?? user.id ?? null;
    const editorName = trigger?.editorName ?? user.fullName ?? undefined;

    const triggerData: AgentBuilderWebhookTriggerType = {
      sId: trigger?.sId,
      enabled: data.enabled,
      name: data.name.trim(),
      customPrompt: data.customPrompt.trim(),
      naturalLanguageDescription:
        webhookSourceView?.kind !== "custom"
          ? naturalDescription || null
          : null,
      kind: "webhook",
      configuration: {
        includePayload: data.includePayload,
        event: data.event,
        filter: data.filter?.trim() ?? undefined,
      },
      webhookSourceViewSId: data.webhookSourceViewSId ?? undefined,
      editor,
      editorName,
    };

    onSave(triggerData);
    handleClose();
  };

  const formFilter = form.getValues("filter");

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

          <FormProvider form={form} onSubmit={onSubmit}>
            <div className="space-y-5">
              <div className="space-y-1">
                <Label htmlFor="trigger-name">Name</Label>
                <Input
                  id="trigger-name"
                  placeholder="Enter trigger name"
                  disabled={!isEditor}
                  {...form.register("name")}
                  isError={!!form.formState.errors.name}
                  message={form.formState.errors.name?.message}
                  messageStatus="error"
                />
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  When disabled, the trigger will not run.
                </p>
                <div className="flex flex-row items-center gap-2">
                  <SliderToggle
                    size="xs"
                    disabled={!isEditor}
                    selected={form.watch("enabled")}
                    onClick={() => {
                      if (!isEditor) {
                        return;
                      }
                      form.setValue("enabled", !form.watch("enabled"));
                    }}
                  />
                  {form.watch("enabled")
                    ? "The trigger is currently enabled"
                    : "The trigger is currently disabled"}
                </div>
              </div>

              {/* Event selector for non-custom webhooks */}
              {selectedPreset && availableEvents.length > 0 && (
                <div className="flex flex-col space-y-1">
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
                            ? availableEvents.find(
                                (e) => e.value === selectedEvent
                              )?.name ?? "Select event"
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
                            form.setValue("event", event.value, {
                              shouldValidate: true,
                            });
                          }}
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {form.formState.errors.event && (
                    <p className="text-sm text-warning">
                      {form.formState.errors.event.message}
                    </p>
                  )}
                </div>
              )}

              {/* Filters input */}
              <div className="space-y-1">
                {selectedPreset && availableEvents.length > 0 && (
                  <>
                    <Label htmlFor="trigger-filter-description">
                      Filter Description (optional)
                    </Label>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      Describe in natural language the conditions under which
                      the agent should trigger. Will always trigger if left
                      empty.
                    </p>
                    <TextArea
                      id="trigger-filter-description"
                      placeholder='e.g. "New pull requests that changes more than 500 lines of code, or have the `auto-review` label."'
                      rows={3}
                      value={naturalDescription}
                      disabled={!isEditor}
                      onChange={(e) => {
                        if (!selectedEvent || !selectedPreset) {
                          form.setError("event", {
                            type: "manual",
                            message: "Please select an event first",
                          });
                          return;
                        }

                        setNaturalDescription(e.target.value);
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
                      Enter a filter that will be used to filter the webhook
                      payload JSON. Will always trigger if left empty.
                    </p>
                    <TextArea
                      id="trigger-filter-description"
                      placeholder={
                        'example:\n\n(and\n  (eq "action" "opened")\n  (exists "pull_request")\n)'
                      }
                      rows={6}
                      {...form.register("filter")}
                      disabled={!isEditor}
                      error={form.formState.errors.filter?.message}
                    />
                  </>
                )}

                <div className="pt-2">{filterGenerationResult}</div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col space-y-1">
                  <Label>Include payload</Label>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    When enabled, the webhook payload will be included in the
                    agent's context.
                  </p>
                </div>
                <Checkbox
                  size="sm"
                  checked={includePayload}
                  onClick={() => {
                    if (!isEditor) {
                      return;
                    }
                    form.setValue("includePayload", !includePayload);
                  }}
                  disabled={!isEditor}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="trigger-prompt">Message (Optional)</Label>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Add context or instructions for the agent when the trigger
                  runs.
                </p>
                <TextArea
                  id="trigger-prompt"
                  rows={4}
                  disabled={!isEditor}
                  {...form.register("customPrompt")}
                />
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

            <TextArea
              id="trigger-filter"
              placeholder="Filter will be generated..."
              disabled={true}
              value={form.watch("filter")}
              rows={3}
              className="hidden"
            />
          </FormProvider>
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
            onClick: isEditor ? form.handleSubmit(onSubmit) : handleClose,
            disabled: form.formState.isSubmitting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
