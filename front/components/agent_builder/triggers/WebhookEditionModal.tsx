import type { Icon } from "@dust-tt/sparkle";
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
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useUser } from "@app/lib/swr/user";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";
import type { PresetWebhook } from "@app/types/triggers/webhooks_source_preset";

const webhookFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  customPrompt: z.string(),
  webhookSourceViewSId: z.string().min(1, "Select a webhook source"),
  event: z.string().nullable(),
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
}

type WebhookOption = {
  value: string;
  label: string;
  kind: WebhookSourceKind;
  icon: typeof Icon;
};

export function WebhookEditionModal({
  owner,
  trigger,
  isOpen,
  onClose,
  onSave,
}: WebhookEditionModalProps) {
  const { user } = useUser();

  const defaultValues = useMemo(
    (): WebhookFormData => ({
      name: "Webhook Trigger",
      customPrompt: "",
      webhookSourceViewSId: "",
      event: null,
      filter: "",
      includePayload: false,
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
  const { webhookSourcesWithViews, isWebhookSourcesWithViewsLoading } =
    useWebhookSourcesWithViews({ owner });

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
    webhookSourcesWithViews.forEach((wsv) => {
      const preset = WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[wsv.kind];
      wsv.views
        .filter((view) => accessibleSpaceIds.has(view.spaceId))
        .forEach((view) => {
          options.push({
            value: view.sId,
            label: view.customName ?? wsv.name,
            kind: view.webhookSource.kind,
            icon: preset.icon,
          });
        });
    });

    return options;
  }, [webhookSourcesWithViews, accessibleSpaceIds]);

  const selectedWebhookSource = useMemo(() => {
    if (!selectedViewSId) {
      return null;
    }
    for (const wsv of webhookSourcesWithViews) {
      const view = wsv.views.find((v) => v.sId === selectedViewSId);
      if (view) {
        return wsv;
      }
    }
    return null;
  }, [webhookSourcesWithViews, selectedViewSId]);

  const selectedPreset = useMemo((): PresetWebhook | null => {
    if (!selectedWebhookSource || selectedWebhookSource.kind === "custom") {
      return null;
    }
    return WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[selectedWebhookSource.kind];
  }, [selectedWebhookSource]);

  const availableEvents = useMemo(() => {
    if (!selectedPreset || !selectedWebhookSource) {
      return [];
    }
    return selectedPreset.events.filter((event) =>
      selectedWebhookSource.subscribedEvents.includes(event.value)
    );
  }, [selectedPreset, selectedWebhookSource]);

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
    const event = trigger.configuration.event ?? null;
    const filter = trigger.configuration.filter ?? "";

    form.reset({
      name: trigger.name,
      customPrompt: trigger.customPrompt ?? "",
      webhookSourceViewSId: trigger.webhookSourceViewSId ?? "",
      event,
      filter,
      includePayload,
    });
  }, [defaultValues, form, isOpen, trigger]);

  const handleClose = () => {
    form.reset(defaultValues);
    onClose();
  };

  const onSubmit = (data: WebhookFormData) => {
    if (!user) {
      return;
    }

    // Validate that event is selected for preset webhooks (not custom)
    if (
      selectedWebhookSource &&
      selectedWebhookSource.kind !== "custom" &&
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
      name: data.name.trim(),
      customPrompt: data.customPrompt.trim(),
      kind: "webhook",
      configuration: {
        includePayload: data.includePayload,
        event: data.event ?? null,
        filter: data.filter?.trim() || null,
      },
      webhookSourceViewSId: data.webhookSourceViewSId ?? undefined,
      editor,
      editorEmail,
    };

    onSave(triggerData);
    handleClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent size="lg">
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

              {/* Webhook Configuration */}
              <div className="flex flex-col space-y-1">
                <Label>Webhook Source</Label>
                {isWebhookSourcesWithViewsLoading ? (
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
                          icon={
                            WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[option.kind].icon
                          }
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
              {selectedPreset && availableEvents.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="trigger-filters">Filters (Optional)</Label>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Add a filter string for the webhook event
                  </p>
                  <Input
                    id="trigger-filter"
                    placeholder="Enter filter"
                    disabled={!isEditor}
                    {...form.register("filter")}
                  />
                </div>
              )}

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
            </div>
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
