import type { Icon } from "@dust-tt/sparkle";
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
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { RecentWebhookRequests } from "@app/components/agent_builder/triggers/RecentWebhookRequests";
import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";
import { useWebhookFilterGeneration } from "@app/components/agent_builder/triggers/useWebhookFilterGeneration";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { WebhookSourceViewIcon } from "@app/components/triggers/WebhookSourceViewIcon";
import { useUser } from "@app/lib/swr/user";
import { useWebhookSourceViewsFromSpaces } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";
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
}

type WebhookOption = {
  value: string;
  label: string;
  kind: WebhookSourceKind;
  icon: React.ComponentType<React.ComponentProps<typeof Icon>>;
};

export function WebhookEditionModal({
  owner,
  trigger,
  isOpen,
  onClose,
  onSave,
  agentConfigurationId,
}: WebhookEditionModalProps) {
  const { user } = useUser();

  const defaultValues = useMemo(
    (): WebhookFormData => ({
      name: "Webhook Trigger",
      enabled: true,
      customPrompt: "",
      webhookSourceViewSId: "",
      event: undefined,
      filter: "",
      includePayload: true,
    }),
    []
  );

  const form = useForm<WebhookFormData>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues,
  });

  const selectedViewSId = form.watch("webhookSourceViewSId") ?? "";
  const selectedEvent = form.watch("event");
  const includePayload = form.watch("includePayload");

  const { spaces } = useSpacesContext();
  const { webhookSourceViews, isLoading: isWebhookSourceViewsLoading } =
    useWebhookSourceViewsFromSpaces(owner, spaces, !isOpen);

  const isEditor = (trigger?.editor ?? user?.id) === user?.id;

  const spaceById = useMemo(() => {
    return new Map(spaces.map((space) => [space.sId, space.name]));
  }, [spaces]);

  const accessibleSpaceIds = useMemo(
    () => new Set(spaceById.keys()),
    [spaceById]
  );

  const webhookOptions = useMemo((): WebhookOption[] => {
    const options: WebhookOption[] = [];
    webhookSourceViews
      .filter((view) => accessibleSpaceIds.has(view.spaceId))
      .forEach((view) => {
        options.push({
          value: view.sId,
          label: view.customName ?? "Untitled Webhook Source View",
          kind: view.kind,
          icon: (props) => (
            <WebhookSourceViewIcon webhookSourceView={view} {...props} />
          ),
        });
      });

    return options;
  }, [webhookSourceViews, accessibleSpaceIds]);

  const selectedWebhookSourceView = useMemo(() => {
    if (!selectedViewSId) {
      return null;
    }
    const view = webhookSourceViews.find((v) => v.sId === selectedViewSId);
    return view;
  }, [webhookSourceViews, selectedViewSId]);

  const selectedPreset = useMemo((): PresetWebhook | null => {
    if (
      !selectedWebhookSourceView ||
      selectedWebhookSourceView.kind === "custom"
    ) {
      return null;
    }
    return WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[selectedWebhookSourceView.kind];
  }, [selectedWebhookSourceView]);

  const availableEvents = useMemo(() => {
    if (!selectedPreset || !selectedWebhookSourceView) {
      return [];
    }
    return selectedPreset.events.filter((event) =>
      selectedWebhookSourceView.subscribedEvents.includes(event.value)
    );
  }, [selectedPreset, selectedWebhookSourceView]);

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

  useEffect(() => {
    if (!isOpen) {
      form.reset(defaultValues);
      return;
    }

    if (!trigger) {
      form.reset(defaultValues);
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
  }, [defaultValues, form, isOpen, trigger]);

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
      selectedWebhookSourceView &&
      selectedWebhookSourceView.kind !== "custom" &&
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
    const editorEmail = trigger?.editorEmail ?? user.email ?? undefined;

    const triggerData: AgentBuilderWebhookTriggerType = {
      sId: trigger?.sId,
      enabled: data.enabled,
      name: data.name.trim(),
      customPrompt: data.customPrompt.trim(),
      kind: "webhook",
      configuration: {
        includePayload: data.includePayload,
        event: data.event,
        filter: data.filter?.trim() ?? undefined,
      },
      webhookSourceViewSId: data.webhookSourceViewSId ?? undefined,
      editor,
      editorEmail,
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            {trigger
              ? isEditor
                ? "Edit Webhook"
                : "View Webhook"
              : "Create Webhook"}
          </SheetTitle>
        </SheetHeader>

        <SheetContainer>
          {trigger && !isEditor && (
            <ContentMessage variant="info">
              You cannot edit this trigger. It is managed by{" "}
              <span className="font-semibold">
                {trigger.editorEmail ?? "another user"}
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

              {/* Webhook Configuration */}
              <div className="flex flex-col space-y-1">
                <Label>Webhook Source</Label>
                {isWebhookSourceViewsLoading ? (
                  <div className="flex items-center gap-2">
                    <Spinner size="sm" />
                    <span className="text-sm text-muted-foreground">
                      Loading webhook sources...
                    </span>
                  </div>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        id="webhook-source"
                        variant="outline"
                        isSelect
                        className="w-fit"
                        disabled={!isEditor}
                        label={
                          selectedViewSId
                            ? webhookOptions.find(
                                (opt) => opt.value === selectedViewSId
                              )?.label
                            : "Select webhook source"
                        }
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel label="Select webhook source" />
                      {webhookOptions.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          label={option.label}
                          disabled={!isEditor}
                          icon={option.icon}
                          onClick={() => {
                            form.setValue(
                              "webhookSourceViewSId",
                              option.value,
                              {
                                shouldValidate: true,
                              }
                            );
                          }}
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
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

                {selectedWebhookSourceView?.kind === "custom" && (
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
