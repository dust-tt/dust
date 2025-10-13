import type { Icon } from "@dust-tt/sparkle";
import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleComponent,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Input,
  Label,
  PrettyJsonViewer,
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
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { WebhookSourceViewIcon } from "@app/components/triggers/WebhookSourceViewIcon";
import { useWebhookFilterGenerator } from "@app/lib/swr/agent_triggers";
import { useUser } from "@app/lib/swr/user";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import { debounce } from "@app/lib/utils/debounce";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";
import type { PresetWebhook } from "@app/types/triggers/webhooks_source_preset";
import { parseMatcherExpression } from "@app/lib/webhooks/payload_matcher";
import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";

const webhookFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
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
}: WebhookEditionModalProps) {
  const { user } = useUser();

  const defaultValues = useMemo(
    (): WebhookFormData => ({
      name: "Webhook Trigger",
      customPrompt: "",
      webhookSourceViewSId: "",
      event: undefined,
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

  const [naturalFilterDescription, setNaturalFilterDescription] = useState("");
  const [filterGenerationStatus, setFilterGenerationStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [filterErrorMessage, setFilterErrorMessage] = useState<string | null>(
    null
  );
  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const generateFilter = useWebhookFilterGenerator({ workspace: owner });

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
      wsv.views
        .filter((view) => accessibleSpaceIds.has(view.spaceId))
        .forEach((view) => {
          options.push({
            value: view.sId,
            label: view.customName ?? wsv.name,
            kind: view.webhookSource.kind,
            icon: (props) => (
              <WebhookSourceViewIcon webhookSourceView={view} {...props} />
            ),
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
    const event = trigger.configuration.event;
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

  const filterGenerationResult = useMemo(() => {
    switch (filterGenerationStatus) {
      case "idle":
        if (form.watch("filter")) {
          return (
            <CollapsibleComponent
              triggerChildren={
                <Label className="cursor-pointer">Generated filter</Label>
              }
              contentChildren={
                <TriggerFilterRenderer data={form.watch("filter")} />
              }
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
            {filterErrorMessage ||
              "Unable to generate filter. Please try rephrasing."}
          </p>
        );
      default:
        return null;
    }
  }, [filterGenerationStatus, filterErrorMessage]);

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
              {selectedPreset && availableEvents.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="trigger-filter-description">
                    Filter Description
                  </Label>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Describe in natural language what events you want to filter
                  </p>
                  <TextArea
                    id="trigger-filter-description"
                    placeholder='e.g. "Only issues with priority high or critical"'
                    rows={3}
                    value={naturalFilterDescription}
                    disabled={!isEditor}
                    onChange={async (e) => {
                      const txt = e.target.value;
                      setNaturalFilterDescription(txt);
                      setFilterGenerationStatus(txt ? "loading" : "idle");

                      if (txt.length >= 10) {
                        debounce(
                          debounceHandle,
                          async () => {
                            form.setValue("filter", "");
                            try {
                              const result = await generateFilter(txt);
                              form.setValue("filter", result.filter);
                              setFilterGenerationStatus("idle");
                              setFilterErrorMessage(null);
                            } catch (error) {
                              setFilterGenerationStatus("error");
                              setFilterErrorMessage(
                                error instanceof Error
                                  ? error.message
                                  : "Unable to generate filter. Please try rephrasing."
                              );
                            }
                          },
                          500
                        );
                      } else {
                        if (debounceHandle.current) {
                          clearTimeout(debounceHandle.current);
                          debounceHandle.current = undefined;
                        }
                        form.setValue("filter", "");
                      }
                    }}
                  />

                  <div className="pt-2">{filterGenerationResult}</div>
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
