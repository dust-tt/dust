import {
  ActionGlobeAltIcon,
  Avatar,
  Button,
  InformationCircleIcon,
  LockIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useContext, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { ConfirmContext } from "@app/components/Confirm";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import type { WebhookSourceFormValues } from "@app/components/triggers/forms/webhookSourceFormSchema";
import {
  diffWebhookSourceForm,
  getWebhookSourceFormDefaults,
  getWebhookSourceFormSchema,
} from "@app/components/triggers/forms/webhookSourceFormSchema";
import { WebhookSourceDetailsInfo } from "@app/components/triggers/WebhookSourceDetailsInfo";
import { WebhookSourceDetailsSharing } from "@app/components/triggers/WebhookSourceDetailsSharing";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import {
  useDeleteWebhookSource,
  useWebhookSourcesWithViews,
} from "@app/lib/swr/webhook_source";
import datadogLogger from "@app/logger/datadogLogger";
import type { LightWorkspaceType, RequireAtLeastOne } from "@app/types";
import type { WebhookSourceWithSystemView } from "@app/types/triggers/webhooks";

type WebhookSourceDetailsProps = {
  owner: LightWorkspaceType;
  onClose: () => void;
  webhookSource: RequireAtLeastOne<WebhookSourceWithSystemView, "systemView">;
  isOpen: boolean;
};

export function WebhookSourceDetails({
  owner,
  webhookSource,
  isOpen,
  onClose,
}: WebhookSourceDetailsProps) {
  const systemView = webhookSource.systemView!;
  const [selectedTab, setSelectedTab] = useState<string>("info");
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [isSaving, setIsSaving] = useState(false);

  const confirm = useContext(ConfirmContext);
  const { deleteWebhookSource, isDeleting } = useDeleteWebhookSource({ owner });
  const sendNotification = useSendNotification(true);

  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { mutateWebhookSourcesWithViews, webhookSourcesWithViews } =
    useWebhookSourcesWithViews({
      owner,
    });

  const webhookSourceWithViews = useMemo(
    () => webhookSourcesWithViews.find((s) => s.sId === webhookSource.sId),
    [webhookSourcesWithViews, webhookSource.sId]
  );

  const defaults = useMemo<WebhookSourceFormValues>(() => {
    return getWebhookSourceFormDefaults(
      systemView,
      webhookSourceWithViews,
      spaces
    );
  }, [systemView, webhookSourceWithViews, spaces]);

  const form = useForm<WebhookSourceFormValues>({
    defaultValues: defaults,
    mode: "onChange",
    shouldUnregister: false,
    resolver: zodResolver(getWebhookSourceFormSchema()),
  });

  useEffect(() => {
    form.reset(defaults);
  }, [defaults, form]);

  useEffect(() => {
    if (isOpen && !prevIsOpen) {
      setSelectedTab("info");
    }
    setPrevIsOpen(isOpen);
  }, [isOpen, prevIsOpen]);

  const applySharingChanges = async (
    sharingChanges: Array<{
      spaceId: string;
      action: "add" | "remove";
    }>
  ) => {
    for (const change of sharingChanges) {
      const space = spaces.find((s) => s.sId === change.spaceId);
      if (!space || space.kind === "system") {
        continue;
      }

      if (change.action === "add") {
        const response = await fetch(
          `/api/w/${owner.sId}/spaces/${space.sId}/webhook_source_views`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              webhookSourceId: webhookSource.sId,
            }),
          }
        );
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error?.message ?? "Failed to add to space");
        }
      } else {
        const view = webhookSourceWithViews?.views.find(
          (v) => v.spaceId === space.sId
        );
        if (view) {
          const response = await fetch(
            `/api/w/${owner.sId}/spaces/${space.sId}/webhook_source_views/${view.sId}`,
            {
              method: "DELETE",
            }
          );
          if (!response.ok) {
            const body = await response.json();
            throw new Error(
              body.error?.message ?? "Failed to remove from space"
            );
          }
        }
      }
    }
  };

  const onSave = async (): Promise<boolean> => {
    let success = false;
    await form.handleSubmit(
      async (values) => {
        try {
          const diff = diffWebhookSourceForm(defaults, values);

          if (diff.name) {
            const response = await fetch(
              `/api/w/${owner.sId}/webhook_sources/views/${systemView.sId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: diff.name }),
              }
            );
            if (!response.ok) {
              const body = await response.json();
              throw new Error(
                body.error?.message ?? "Failed to update webhook source view"
              );
            }
          }

          if (diff.sharingChanges && diff.sharingChanges.length > 0) {
            await applySharingChanges(diff.sharingChanges);
          }

          await mutateWebhookSourcesWithViews();

          sendNotification({
            type: "success",
            title: `${webhookSource.name} updated`,
            description: "Your changes have been saved.",
          });

          form.reset(values);
          success = true;
        } catch (error) {
          sendNotification({
            type: "error",
            title: "Failed to save changes",
            description:
              error instanceof Error
                ? error.message
                : "An error occurred while saving changes.",
          });
          datadogLogger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              webhookSourceViewId: systemView.sId,
            },
            "[Webhook Details] - Save error"
          );
          success = false;
        }
      },
      async (errors) => {
        const keys = Object.keys(errors);
        const errorDetails = keys
          .map((key) => {
            const error = errors[key as keyof typeof errors];
            return `${key}: ${error?.message ?? "invalid"}`;
          })
          .join(", ");

        const details =
          keys.length > 0 ? `Invalid: ${errorDetails}` : undefined;
        datadogLogger.error(
          {
            fields: keys,
            errors: errors,
            values: form.getValues(),
            webhookSourceViewId: systemView.sId,
          },
          "[Webhook Details] - Form validation error"
        );
        sendNotification({
          type: "error",
          title: "Invalid form data",
          description: details,
        });
        success = false;
      }
    )();
    return success;
  };

  const onCancel = () => {
    form.reset();
  };

  const changeTab = async (next: string) => {
    setSelectedTab(next);
  };

  const handleOpenChange = async (open: boolean) => {
    if (open) {
      return;
    }

    const hasUnsavedChanges = form.formState.isDirty;

    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: "Unsaved changes will be lost",
        message:
          "All unsaved changes will be lost. Are you sure you want to close?",
        validateLabel: "Close without saving",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
    }

    onCancel();
    onClose();
  };

  return (
    <FormProvider form={form}>
      <Sheet open={isOpen} onOpenChange={(open) => void handleOpenChange(open)}>
        <SheetContent size="lg">
          <SheetHeader className="flex flex-col gap-5 text-foreground dark:text-foreground-night">
            <div className="flex items-center gap-3">
              <Avatar icon={ActionGlobeAltIcon} size="md" />
              <div>
                <SheetTitle>
                  {systemView.customName ?? systemView.webhookSource.name}
                </SheetTitle>
                <SheetDescription>
                  Webhook source for triggering assistants.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <SheetContainer>
            <Tabs
              value={selectedTab}
              onValueChange={(v) => void changeTab(v as string)}
            >
              <TabsList>
                <TabsTrigger
                  value="info"
                  label="Info"
                  icon={InformationCircleIcon}
                />
                <TabsTrigger value="sharing" label="Sharing" icon={LockIcon} />
                <>
                  <div className="grow" />
                  <div className="flex h-full flex-row items-center">
                    <Button
                      icon={TrashIcon}
                      variant="warning"
                      size="xs"
                      disabled={isDeleting}
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: "Confirm Removal",
                          message: (
                            <div>
                              Are you sure you want to remove{" "}
                              <span className="font-semibold">
                                {webhookSource.name}
                              </span>
                              ?
                              <div className="mt-2 font-semibold">
                                This action cannot be undone.
                              </div>
                            </div>
                          ),
                          validateLabel: "Remove",
                          validateVariant: "warning",
                        });
                        if (!confirmed) {
                          return;
                        }
                        const deleted = await deleteWebhookSource(
                          webhookSource.sId
                        );
                        if (deleted) {
                          onClose();
                        }
                      }}
                    />
                  </div>
                </>
              </TabsList>
              <div className="mt-4">
                <TabsContent value="info">
                  <div className="flex flex-col gap-4">
                    <WebhookSourceDetailsInfo
                      webhookSourceView={systemView}
                      owner={owner}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="sharing">
                  <WebhookSourceDetailsSharing
                    webhookSource={webhookSource}
                    owner={owner}
                    spaces={spaces}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </SheetContainer>
          <SheetFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              disabled: isSaving || form.formState.isSubmitting,
              onClick: () => handleOpenChange(false),
            }}
            rightButtonProps={{
              label:
                isSaving || form.formState.isSubmitting ? "Saving..." : "Save",
              variant: "primary",
              disabled: isSaving || form.formState.isSubmitting,
              onClick: async () => {
                setIsSaving(true);
                try {
                  await onSave();
                } finally {
                  setIsSaving(false);
                }
              },
            }}
          />
        </SheetContent>
      </Sheet>
    </FormProvider>
  );
}
