import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  Button,
  InformationCircleIcon,
  LockIcon,
  MultiPageSheet,
  MultiPageSheetContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrashIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { ConfirmContext } from "@app/components/Confirm";
import type { CreateWebhookSourceFormData } from "@app/components/triggers/CreateWebhookSourceForm";
import {
  CreateWebhookSourceFormContent,
  CreateWebhookSourceSchema,
  validateCustomHeadersFromString,
} from "@app/components/triggers/CreateWebhookSourceForm";
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
  useCreateWebhookSource,
  useDeleteWebhookSource,
  useWebhookSourcesWithViews,
} from "@app/lib/swr/webhook_source";
import datadogLogger from "@app/logger/datadogLogger";
import type { LightWorkspaceType, RequireAtLeastOne } from "@app/types";
import type {
  WebhookSourceKind,
  WebhookSourceWithSystemView,
} from "@app/types/triggers/webhooks";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";

export type WebhookSourceSheetMode = { kind: WebhookSourceKind } & (
  | { type: "create" }
  | {
      type: "edit";
      webhookSource: RequireAtLeastOne<
        WebhookSourceWithSystemView,
        "systemView"
      >;
    }
);

type WebhookSourceSheetProps = {
  owner: LightWorkspaceType;
  mode: WebhookSourceSheetMode | null;
  onClose: () => void;
};

export function WebhookSourceSheet({
  owner,
  mode,
  onClose,
}: WebhookSourceSheetProps) {
  const confirm = useContext(ConfirmContext);
  const open = mode !== null;
  const [isDirty, setIsDirty] = useState(false);

  // Custom open hook to only have debounce when we close.
  // We use this value to unmount the Sheet Content, and we need
  // debounce when closing to avoid messing up the closing animation.
  // 300ms is vibe based.
  const [debouncedOpen, setDebouncedOpen] = useState(() => open);
  useEffect(() => {
    if (open) {
      setDebouncedOpen(true);
    } else {
      const timeout = setTimeout(() => {
        setDebouncedOpen(false);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  const handleOpenChange = useCallback(async () => {
    if (isDirty) {
      const confirmed = await confirm({
        title: "Unsaved changes",
        message:
          "You have unsaved changes. Are you sure you want to close without saving?",
        validateLabel: "Discard changes",
        validateVariant: "warning",
      });

      if (!confirmed) {
        return;
      }
    }

    onClose();
  }, [isDirty, confirm, onClose]);

  return (
    <MultiPageSheet open={open} onOpenChange={handleOpenChange}>
      {debouncedOpen && mode !== null && (
        <WebhookSourceSheetContent
          mode={mode}
          owner={owner}
          setIsDirty={setIsDirty}
          onClose={onClose}
          onCancel={handleOpenChange}
        />
      )}
    </MultiPageSheet>
  );
}

type WebhookSourceSheetContentProps = {
  mode: WebhookSourceSheetMode;
  owner: LightWorkspaceType;
  setIsDirty: (value: boolean) => void;
  onClose: () => void;
  onCancel: () => Promise<void>;
};

function WebhookSourceSheetContent({
  mode,
  owner,
  setIsDirty,
  onClose,
  onCancel,
}: WebhookSourceSheetContentProps) {
  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification(true);
  const [currentPageId, setCurrentPageId] = useState<
    WebhookSourceSheetMode["type"]
  >(mode.type);
  const [selectedTab, setSelectedTab] = useState<string>("info");
  const [isSaving, setIsSaving] = useState(false);

  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });

  const { mutateWebhookSourcesWithViews, webhookSourcesWithViews } =
    useWebhookSourcesWithViews({
      owner,
    });

  const { deleteWebhookSource, isDeleting } = useDeleteWebhookSource({ owner });
  const createWebhookSource = useCreateWebhookSource({ owner });

  useEffect(() => {
    if (mode) {
      setCurrentPageId(mode.type);
      if (mode.type === "edit") {
        setSelectedTab("info");
      }
    }
  }, [mode]);

  const webhookSource = mode?.type === "edit" ? mode.webhookSource : null;
  const systemView = webhookSource?.systemView ?? null;

  const webhookSourceWithViews = useMemo(
    () =>
      webhookSource
        ? webhookSourcesWithViews.find((s) => s.sId === webhookSource.sId)
        : null,
    [webhookSourcesWithViews, webhookSource]
  );

  // Create form
  const createFormDefaultValues = useMemo<CreateWebhookSourceFormData>(
    () => ({
      name: "",
      secret: "",
      autoGenerate: true,
      signatureHeader: "",
      signatureAlgorithm: "sha256",
      customHeaders: null,
      kind: mode.kind,
      subscribedEvents:
        mode.kind === "custom"
          ? []
          : WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[mode.kind].events.map(
              (e) => e.value
            ),
    }),
    [mode.kind]
  );

  const createForm = useForm<CreateWebhookSourceFormData>({
    resolver: zodResolver(CreateWebhookSourceSchema),
    defaultValues: createFormDefaultValues,
  });

  useEffect(() => {
    setIsDirty(createForm.formState.isDirty);
  }, [createForm.formState.isDirty, setIsDirty]);

  // Edit form
  const editDefaults = useMemo<WebhookSourceFormValues | null>(() => {
    if (!systemView || !webhookSourceWithViews) {
      return null;
    }
    return getWebhookSourceFormDefaults(
      systemView,
      webhookSourceWithViews,
      spaces
    );
  }, [systemView, webhookSourceWithViews, spaces]);

  const editForm = useForm<WebhookSourceFormValues>({
    defaultValues: editDefaults ?? undefined,
    mode: "onChange",
    shouldUnregister: false,
    resolver: zodResolver(getWebhookSourceFormSchema()),
  });

  useEffect(() => {
    if (editDefaults) {
      editForm.reset(editDefaults);
    }
  }, [editDefaults, editForm]);

  useEffect(() => {
    setIsDirty(editForm.formState.isDirty);
  }, [editForm.formState.isDirty, setIsDirty]);

  const onCreateSubmit = useCallback(
    async (data: CreateWebhookSourceFormData) => {
      const parsedCustomHeaders = validateCustomHeadersFromString(
        data.customHeaders
      );

      const apiData = {
        ...data,
        customHeaders: parsedCustomHeaders?.parsed ?? null,
        includeGlobal: true,
      };

      await createWebhookSource(apiData);

      createForm.reset();
      onClose();
    },
    [createWebhookSource, createForm, onClose]
  );

  const applySharingChanges = useCallback(
    async (
      sharingChanges: Array<{
        spaceId: string;
        action: "add" | "remove";
      }>
    ) => {
      if (!webhookSource) {
        return;
      }

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
    },
    [webhookSource, spaces, owner.sId, webhookSourceWithViews]
  );

  const onEditSave = useCallback(async (): Promise<boolean> => {
    if (!editDefaults || !systemView || !webhookSource) {
      return false;
    }

    let success = false;
    await editForm.handleSubmit(
      async (values) => {
        try {
          const diff = diffWebhookSourceForm(editDefaults, values);

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

          editForm.reset(values);
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
        const errorEntries = Object.entries(errors);
        const errorDetails = errorEntries
          .map(([key, error]) => {
            return `${key}: ${error?.message ?? "invalid"}`;
          })
          .join(", ");

        const details =
          errorEntries.length > 0 ? `Invalid: ${errorDetails}` : undefined;
        datadogLogger.error(
          {
            fields: errorEntries.map(([key]) => key),
            errors: errors,
            values: editForm.getValues(),
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
  }, [
    editDefaults,
    systemView,
    webhookSource,
    editForm,
    owner.sId,
    applySharingChanges,
    mutateWebhookSourcesWithViews,
    sendNotification,
  ]);

  const changeTab = useCallback((next: string) => {
    setSelectedTab(next);
  }, []);

  const handlePageChange = useCallback((pageId: string) => {
    setCurrentPageId(pageId as "edit" | "create");
  }, []);

  const handleDeleteWebhookSource = useCallback(async () => {
    if (!webhookSource) {
      return;
    }

    const confirmed = await confirm({
      title: "Confirm Removal",
      message: (
        <div>
          Are you sure you want to remove{" "}
          <span className="font-semibold">{webhookSource.name}</span>?
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

    const deleted = await deleteWebhookSource(webhookSource.sId);
    if (deleted) {
      onClose();
    }
  }, [confirm, webhookSource, deleteWebhookSource, onClose]);

  const footerButtons = useMemo(() => {
    if (currentPageId === "create") {
      return {
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: onCancel,
        },
        rightButton: {
          label: createForm.formState.isSubmitting ? "Saving..." : "Save",
          variant: "primary",
          disabled: createForm.formState.isSubmitting,
          onClick: () => {
            void createForm.handleSubmit(onCreateSubmit)();
          },
        },
      };
    }

    return {
      leftButton: {
        label: "Cancel",
        variant: "outline",
        disabled: isSaving || editForm.formState.isSubmitting,
        onClick: onCancel,
      },
      rightButton: {
        label:
          isSaving || editForm.formState.isSubmitting ? "Saving..." : "Save",
        variant: "primary",
        disabled: isSaving || editForm.formState.isSubmitting,
        onClick: async () => {
          setIsSaving(true);
          try {
            await onEditSave();
          } finally {
            setIsSaving(false);
          }
        },
      },
    };
  }, [
    currentPageId,
    createForm,
    editForm.formState.isSubmitting,
    isSaving,
    onCancel,
    onCreateSubmit,
    onEditSave,
  ]);

  const pages: MultiPageSheetPage[] = useMemo(
    () => [
      {
        id: "create",
        title: `Create ${WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[mode.kind].name} Webhook Source`,
        description: "",
        icon: WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[mode.kind].icon,
        content: (
          <FormProvider {...createForm}>
            <div className="space-y-4">
              <CreateWebhookSourceFormContent
                form={createForm}
                kind={mode.kind}
              />
            </div>
          </FormProvider>
        ),
      },
      {
        id: "edit",
        title:
          systemView?.customName ?? webhookSource?.name ?? "Webhook Source",
        description: "Webhook source for triggering assistants.",
        icon: WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[mode.kind].icon,
        content:
          systemView && webhookSource ? (
            <FormProvider {...editForm}>
              <Tabs value={selectedTab} onValueChange={changeTab}>
                <TabsList>
                  <TabsTrigger
                    value="info"
                    label="Info"
                    icon={InformationCircleIcon}
                  />
                  <TabsTrigger
                    value="sharing"
                    label="Sharing"
                    icon={LockIcon}
                  />
                  <>
                    <div className="grow" />
                    <div className="flex h-full flex-row items-center">
                      <Button
                        icon={TrashIcon}
                        variant="warning"
                        size="xs"
                        disabled={isDeleting}
                        onClick={handleDeleteWebhookSource}
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
            </FormProvider>
          ) : null,
      },
    ],
    [
      createForm,
      systemView,
      webhookSource,
      editForm,
      selectedTab,
      mode,
      changeTab,
      isDeleting,
      handleDeleteWebhookSource,
      owner,
      spaces,
    ]
  );

  return (
    <MultiPageSheetContent
      size="lg"
      pages={pages}
      currentPageId={currentPageId}
      onPageChange={handlePageChange}
      showNavigation={false}
      showHeaderNavigation={false}
      addFooterSeparator
      {...footerButtons}
    />
  );
}
