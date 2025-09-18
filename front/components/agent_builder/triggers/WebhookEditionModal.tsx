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
import uniqueId from "lodash/uniqueId";
import React, { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { AgentBuilderWebhookTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useUser } from "@app/lib/swr/user";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";

const webhookFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  customPrompt: z.string(),
  webhookSourceViewSId: z.string().min(1, "Select a webhook source"),
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
      includePayload: false,
    }),
    []
  );

  const form = useForm<WebhookFormData>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues,
  });

  const selectedViewSId = form.watch("webhookSourceViewSId") ?? "";
  const includePayload = form.watch("includePayload");

  const { spaces } = useSpacesContext();
  const { webhookSourcesWithViews, isWebhookSourcesWithViewsLoading } =
    useWebhookSourcesWithViews({ owner });

  const isEditor = trigger?.editor ? trigger?.editor === user?.id : false;

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
          });
        });
    });

    return options;
  }, [webhookSourcesWithViews, accessibleSpaceIds, spaceById]);

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

    form.reset({
      name: trigger.name,
      customPrompt: trigger.customPrompt ?? "",
      webhookSourceViewSId: trigger.webhookSourceViewSId ?? "",
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

    const editor = trigger?.editor ?? user.id ?? null;
    const editorEmail = trigger?.editorEmail ?? user.email ?? undefined;

    const triggerData: AgentBuilderWebhookTriggerType = {
      sId: trigger?.sId ?? uniqueId(),
      name: data.name.trim(),
      customPrompt: data.customPrompt.trim(),
      kind: "webhook",
      configuration: {
        includePayload: data.includePayload,
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
