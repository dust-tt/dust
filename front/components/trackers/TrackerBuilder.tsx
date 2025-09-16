import {
  Button,
  Checkbox,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Page,
  TextArea,
  TrashIcon,
} from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";
import { LockIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useContext, useMemo, useState } from "react";

import { AdvancedSettings } from "@app/components/assistant_builder/AdvancedSettings";
import { ConfirmContext } from "@app/components/Confirm";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import {
  AppLayoutSimpleCloseTitle,
  AppLayoutSimpleSaveCancelTitle,
} from "@app/components/sparkle/AppLayoutTitle";
import TrackerBuilderDataSourceModal from "@app/components/trackers/TrackerBuilderDataSourceModal";
import { TrackerDataSourceSelectedTree } from "@app/components/trackers/TrackerDataSourceSelectedTree";
import { useSendNotification } from "@app/hooks/useNotification";
import { isConnectorTypeTrackable } from "@app/lib/connector_providers";
import { useModels } from "@app/lib/swr/models";
import { isEmailValid } from "@app/lib/utils";
import type {
  APIError,
  DataSourceViewSelectionConfiguration,
  DataSourceViewType,
  SpaceType,
  SubscriptionType,
  SupportedModel,
  TrackerConfigurationStateType,
  WorkspaceType,
} from "@app/types";
import {
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  TRACKER_FREQUENCIES,
} from "@app/types";

export const TrackerBuilder = ({
  owner,
  subscription,
  globalSpace,
  dataSourceViews,
  initialTrackerState,
  initialTrackerId,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  globalSpace: SpaceType;
  dataSourceViews: DataSourceViewType[];
  initialTrackerState: TrackerConfigurationStateType | null;
  initialTrackerId: string | null;
}) => {
  const router = useRouter();
  const { models } = useModels({ owner });
  const confirm = useContext(ConfirmContext);
  const sendNotification = useSendNotification();

  const [edited, setEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [tracker, setTracker] = useState<TrackerConfigurationStateType>(
    initialTrackerState ?? {
      status: "active",
      name: null,
      nameError: null,
      description: null,
      descriptionError: null,
      prompt: null,
      promptError: null,
      frequency: TRACKER_FREQUENCIES[0].value,
      frequencyError: null,
      skipEmptyEmails: true,
      recipients: "",
      recipientsError: null,
      modelId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.modelId,
      providerId: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.providerId,
      temperature: 0.5,
      maintainedDataSources: {},
      watchedDataSources: {},
    }
  );

  const extractEmails = (text: string): string[] => [
    ...new Set(text.split(/[\n,]+/).map((e) => e.trim())),
  ];

  const validateForm = () => {
    let hasValidationError = false;
    if (!tracker.name) {
      setTracker((t) => ({
        ...t,
        nameError: "Name is required.",
      }));
      hasValidationError = true;
    }
    if (!tracker.recipients?.length) {
      setTracker((t) => ({
        ...t,
        recipientsError: "At least one recipient is required.",
      }));
      hasValidationError = true;
    } else {
      const recipients = extractEmails(tracker.recipients);
      if (recipients.map(isEmailValid).includes(false)) {
        setTracker((t) => ({
          ...t,
          recipientsError:
            "Invalid email addresses: " +
            recipients.filter((e) => !isEmailValid(e)).join(", "),
        }));
        hasValidationError = true;
      }
    }
    if (!tracker.prompt) {
      setTracker((t) => ({
        ...t,
        promptError: "Prompt is required.",
      }));
      hasValidationError = true;
    }
    return hasValidationError;
  };

  const dataSourceToPayload = (
    {
      dataSourceView,
      selectedResources,
      isSelectAll,
    }: DataSourceViewSelectionConfiguration,
    workspaceId: string
  ) => ({
    dataSourceViewId: dataSourceView.sId,
    workspaceId,
    filter: {
      parents: !isSelectAll
        ? {
            in: selectedResources.map((r) => r.internalId),
            not: [],
          }
        : null,
    },
  });

  // todo use submit function.
  const onSubmit = async () => {
    setIsSubmitting(true);
    const hasValidationError = validateForm();
    if (hasValidationError) {
      setIsSubmitting(false);
      return;
    }

    let route = `/api/w/${owner.sId}/spaces/${globalSpace.sId}/trackers`;
    let method = "POST";

    if (initialTrackerId) {
      route += `/${initialTrackerId}`;
      method = "PATCH";
    }

    const res = await fetch(route, {
      method,
      body: JSON.stringify({
        status: tracker.status,
        name: tracker.name,
        description: tracker.description,
        prompt: tracker.prompt,
        modelId: tracker.modelId,
        providerId: tracker.providerId,
        temperature: tracker.temperature,
        frequency: tracker.frequency,
        skipEmptyEmails: tracker.skipEmptyEmails,
        recipients: tracker.recipients ? extractEmails(tracker.recipients) : [],
        maintainedDataSources: Object.values(tracker.maintainedDataSources).map(
          (ds) => dataSourceToPayload(ds, owner.sId)
        ),
        watchedDataSources: Object.values(tracker.watchedDataSources).map(
          (ds) => dataSourceToPayload(ds, owner.sId)
        ),
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Handle errors.
    if (!res.ok) {
      const resJson = await res.json();
      setIsSubmitting(false);
      sendNotification({
        title: initialTrackerId
          ? "Failed to update tracker"
          : "Failed to create tracker",
        description: resJson.error.message,
        type: "error",
      });
      return;
    }
    setIsSubmitting(false);
    await router.push(`/w/${owner.sId}/labs/trackers`);
    sendNotification({
      title: initialTrackerId ? "Tracker updated" : "Tracker Created",
      description: initialTrackerId
        ? "Tracker updated successfully"
        : "Tracker created successfully.",
      type: "success",
    });
  };

  const onDelete = async () => {
    if (!initialTrackerId) {
      // Should never happen.
      sendNotification({
        title: "Failed to delete tracker",
        description: "Can't delete a tracker that hasn't been created yet.",
        type: "error",
      });
      return;
    }

    if (
      await confirm({
        title: "This can't be undone",
        message: "Are you sure you want to delete this tracker?",
        validateVariant: "warning",
      })
    ) {
      setIsDeleting(true);
      const res = await fetch(
        `/api/w/${owner.sId}/spaces/${globalSpace.sId}/trackers/${initialTrackerId}`,
        {
          method: "DELETE",
        }
      );
      if (res.ok) {
        setIsDeleting(false);
        void router.push(`/w/${owner.sId}/labs/trackers`);
        sendNotification({
          title: "Tracker deleted",
          description: "Tracker successfully deleted.",
          type: "success",
        });
      } else {
        setIsDeleting(false);
        const err = (await res.json()) as { error: APIError };
        sendNotification({
          title: "Failed to delete tracker",
          description: err.error.message,
          type: "error",
        });
      }
      return true;
    } else {
      return false;
    }
  };

  const trackableDataSourcesViews = useMemo(
    () =>
      dataSourceViews.filter(
        (dsv) =>
          !dsv.dataSource.connectorProvider ||
          isConnectorTypeTrackable(dsv.dataSource.connectorProvider)
      ),
    [dataSourceViews]
  );

  return (
    <AppCenteredLayout
      owner={owner}
      subscription={subscription}
      hideSidebar
      pageTitle={
        initialTrackerId ? "Dust - Edit Tracker" : "Dust - New Tracker"
      }
      title={
        !edited ? (
          <AppLayoutSimpleCloseTitle
            title={initialTrackerId ? "Edit Tracker" : "New Tracker"}
            onClose={() => {
              void router.push(`/w/${owner.sId}/labs/trackers`);
            }}
          />
        ) : (
          <AppLayoutSimpleSaveCancelTitle
            title={initialTrackerId ? "Edit Tracker" : "New Tracker"}
            onCancel={() => {
              void router.push(`/w/${owner.sId}/labs/trackers`);
            }}
            onSave={onSubmit}
            isSaving={isSubmitting}
          />
        )
      }
    >
      <div className="flex flex-col gap-16 pb-12 pt-2">
        <div className="flex">
          <div className="flex flex-grow" />
          <div className="flex flex-shrink-0 gap-2">
            {initialTrackerId && (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Chip
                    size="sm"
                    color={tracker.status === "active" ? "success" : "warning"}
                    className="capitalize"
                    icon={tracker.status === "active" ? undefined : LockIcon}
                  >
                    {capitalize(tracker.status)}
                  </Chip>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    key={tracker.status}
                    label={
                      tracker.status === "active" ? "Deactivate" : "Activate"
                    }
                    onClick={() => {
                      setTracker((t) => ({
                        ...t,
                        status:
                          tracker.status === "active" ? "inactive" : "active",
                      }));
                      if (!edited) {
                        setEdited(true);
                      }
                    }}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <AdvancedSettings
              generationSettings={{
                modelSettings: {
                  modelId: tracker.modelId,
                  providerId: tracker.providerId,
                },
                temperature: tracker.temperature,
                reasoningEffort: "none",
              }}
              setGenerationSettings={(g: {
                modelSettings: SupportedModel;
                temperature: number;
              }) => {
                setTracker((t) => ({
                  ...t,
                  modelId: g.modelSettings.modelId,
                  providerId: g.modelSettings.providerId,
                  temperature: g.temperature,
                }));
                if (!edited) {
                  setEdited(true);
                }
              }}
              models={models}
            />
            {initialTrackerId && (
              <Button
                icon={TrashIcon}
                tooltip="Delete Tracker"
                variant="outline"
                onClick={onDelete}
                isLoading={isDeleting}
                disabled={isSubmitting || isDeleting}
              />
            )}
          </div>
        </div>

        {/* Tracker Settings */}

        <div className="flex flex-col gap-8">
          <div>
            <Page.SectionHeader title="Naming" />
            <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              Give your tracker a clear, memorable name and description that
              will help you and your team identify its purpose.
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <Input
                label="Name"
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                value={tracker.name || ""}
                onChange={(e) => {
                  setTracker((t) => ({
                    ...t,
                    name: e.target.value,
                    nameError: null,
                  }));
                  if (!edited) {
                    setEdited(true);
                  }
                }}
                placeholder="Descriptive name."
                message={tracker.nameError}
                messageStatus={tracker.nameError ? "error" : undefined}
                disabled={tracker.status === "inactive"}
              />
            </div>
            <div className="md:col-span-2">
              <Input
                label="Description"
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                value={tracker.description || ""}
                onChange={(e) => {
                  setTracker((t) => ({
                    ...t,
                    description: e.target.value,
                    descriptionError: null,
                  }));
                  if (!edited) {
                    setEdited(true);
                  }
                }}
                placeholder="Brief description of what you're tracking and why."
                message={tracker.descriptionError}
                messageStatus={tracker.descriptionError ? "error" : undefined}
                disabled={tracker.status === "inactive"}
              />
            </div>
          </div>
        </div>

        {/* Notification Settings */}

        <div className="flex flex-col gap-8">
          <div>
            <Page.SectionHeader title="Notification Settings" />
            <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              Choose when and who receives update notifications. We'll bundle
              all tracked changes into organized email summaries delivered on
              your preferred schedule.
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex md:col-span-1">
              <div className="flex flex-col space-y-2">
                <Label className="mb-1">Notification frequency</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      label={
                        TRACKER_FREQUENCIES.find(
                          (f) => f.value === tracker.frequency
                          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        )?.label || "Select Frequency"
                      }
                      variant="outline"
                      isSelect
                      disabled={tracker.status === "inactive"}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {TRACKER_FREQUENCIES.map(({ label, value }) => (
                      <DropdownMenuItem
                        key={label}
                        label={label}
                        onClick={() => {
                          setTracker((t) => ({
                            ...t,
                            frequency: value,
                          }));
                          if (!edited) {
                            setEdited(true);
                          }
                        }}
                      />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="md:col-span-2">
              <Input
                label="Recipients"
                placeholder="Enter email addresses (separate multiple addresses with commas)."
                value={tracker.recipients}
                onChange={(e) => {
                  setTracker((t) => ({
                    ...t,
                    recipients: e.target.value,
                    recipientsError: null,
                  }));
                  if (!edited) {
                    setEdited(true);
                  }
                }}
                message={tracker.recipientsError}
                messageStatus={tracker.recipientsError ? "error" : undefined}
                disabled={tracker.status === "inactive"}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex md:col-span-1">
              <div className="flex flex-col space-y-2"></div>
            </div>
            <div className="md:col-span-2">
              <div className="flex flex-row gap-2">
                <Checkbox
                  label="Send me a copy of the email"
                  checked={tracker.skipEmptyEmails}
                  onCheckedChange={() => {
                    setTracker((t) => ({
                      ...t,
                      skipEmptyEmails: !t.skipEmptyEmails,
                    }));
                    if (!edited) {
                      setEdited(true);
                    }
                  }}
                />
                <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Don't send emails when there are no updates.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DataSource Configurations Settings */}

        <div className="flex flex-col gap-8">
          <div>
            <Page.SectionHeader title="Tracker Settings" />
            <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              Set up what you want to track and monitor. Tell us what to look
              for, specify which documents to maintain current versions of, and
              select which documents to watch for changes.
            </div>
          </div>
          <div className="flex flex-col space-y-2">
            <Label className="mb-1">Instructions</Label>
            <TextArea
              placeholder="Describe what changes or updates you want to track (be as specific as possible)."
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              value={tracker.prompt || ""}
              onChange={(e) => {
                setTracker((t) => ({
                  ...t,
                  prompt: e.target.value,
                  promptError: null,
                }));
                if (!edited) {
                  setEdited(true);
                }
              }}
              error={tracker.promptError}
              showErrorLabel={!!tracker.promptError}
              disabled={tracker.status === "inactive"}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <div className="flex flex-col space-y-2">
                <Label className="mb-1">Documents to maintain</Label>
                <TrackerBuilderDataSourceModal
                  owner={owner}
                  onSave={async (dsConfigs) => {
                    setTracker((t) => ({
                      ...t,
                      maintainedDataSources: dsConfigs,
                    }));
                    if (!edited) {
                      setEdited(true);
                    }
                  }}
                  dataSourceViews={trackableDataSourcesViews} // Only show trackable data sources.
                  initialDataSourceConfigurations={
                    tracker.maintainedDataSources
                  }
                  allowedSpaces={[globalSpace]}
                  viewType="document"
                  disabled={tracker.status === "inactive"}
                />
              </div>
            </div>
            <div className="flex md:col-span-2">
              <div className="flex flex-col space-y-2">
                <Label className="mb-1">Maintained Documents</Label>
                {Object.keys(tracker.maintainedDataSources).length === 0 ? (
                  <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                    No documents selected.
                  </div>
                ) : (
                  <TrackerDataSourceSelectedTree
                    owner={owner}
                    dataSourceConfigurations={tracker.maintainedDataSources}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <div className="flex flex-col space-y-2">
                <Label className="mb-1">Documents to watch</Label>
                <TrackerBuilderDataSourceModal
                  owner={owner}
                  onSave={async (dsConfigs) => {
                    setTracker((t) => ({
                      ...t,
                      watchedDataSources: dsConfigs,
                    }));
                    if (!edited) {
                      setEdited(true);
                    }
                  }}
                  dataSourceViews={dataSourceViews}
                  initialDataSourceConfigurations={tracker.watchedDataSources}
                  allowedSpaces={[globalSpace]}
                  viewType="document"
                  disabled={tracker.status === "inactive"}
                />
              </div>
            </div>
            <div className="flex md:col-span-2">
              <div className="flex flex-col space-y-2">
                <Label className="mb-1">Watched Documents</Label>
                {Object.keys(tracker.watchedDataSources).length === 0 ? (
                  <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                    No documents selected.
                  </div>
                ) : (
                  <TrackerDataSourceSelectedTree
                    owner={owner}
                    dataSourceConfigurations={tracker.watchedDataSources}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppCenteredLayout>
  );
};
