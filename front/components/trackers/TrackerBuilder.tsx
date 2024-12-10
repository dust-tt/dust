import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Page,
  TextArea,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  SpaceType,
  SubscriptionType,
  SupportedModel,
  TrackerConfigurationStateType,
  TrackerConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  TRACKER_FREQUENCY_TYPES,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useState } from "react";

import { AdvancedSettings } from "@app/components/assistant_builder/InstructionScreen";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { isEmailValid } from "@app/lib/utils";

export const TrackerBuilder = ({
  owner,
  subscription,
  globalSpace,
  dataSourceViews,
  trackerToEdit,
}: {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  globalSpace: SpaceType;
  dataSourceViews: DataSourceViewType[];
  trackerToEdit: TrackerConfigurationType | null;
}) => {
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tracker, setTracker] = useState<TrackerConfigurationStateType>({
    name: trackerToEdit?.name ?? null,
    nameError: null,
    description: trackerToEdit?.description ?? null,
    descriptionError: null,
    prompt: trackerToEdit?.prompt ?? null,
    promptError: null,
    frequency: trackerToEdit?.frequency ?? "daily",
    frequencyError: null,
    recipients: trackerToEdit?.recipients?.join(", ") ?? null,
    recipientsError: null,
    modelId:
      trackerToEdit?.modelId ?? CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.modelId,
    providerId:
      trackerToEdit?.providerId ??
      CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.providerId,
    temperature: trackerToEdit?.temperature ?? 0.5,
  });

  void dataSourceViews; // todo: use this

  const extractEmails = (text: string): string[] => [
    ...new Set(text.split(/[\n,]+/).map((e) => e.trim())),
  ];

  const onSubmit = async () => {
    // Validate the form
    setIsSubmitting(true);
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
    if (hasValidationError) {
      setIsSubmitting(false);
      return;
    }

    let route = `/api/w/${owner.sId}/spaces/${globalSpace.sId}/trackers`;
    let method = "POST";

    if (trackerToEdit) {
      route += `/${trackerToEdit.sId}`;
      method = "PATCH";
    }

    const res = await fetch(route, {
      method,
      body: JSON.stringify({
        name: tracker.name,
        description: tracker.description,
        prompt: tracker.prompt,
        modelId: tracker.modelId,
        providerId: tracker.providerId,
        temperature: tracker.temperature,
        frequency: tracker.frequency,
        recipients: tracker.recipients ? extractEmails(tracker.recipients) : [],
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Handle errors.
    if (!res.ok) {
      const resJson = await res.json();
      sendNotification({
        title: trackerToEdit
          ? "Failed to update tracker"
          : "Failed to create tracker",
        description: resJson.error.message,
        type: "error",
      });
      setIsSubmitting(false);
      return;
    }

    sendNotification({
      title: trackerToEdit ? "Tracker updated" : "Tracker Created",
      description: trackerToEdit
        ? "Tracker updated successfully"
        : "Tracker created successfully.",
      type: "success",
    });
    setIsSubmitting(false);
    await router.push(`/w/${owner.sId}/assistant/labs/trackers`);
  };

  return (
    <AppLayout
      owner={owner}
      subscription={subscription}
      hideSidebar
      isWideMode
      pageTitle={trackerToEdit ? "Dust - Edit Tracker" : "Dust - New Tracker"}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title={trackerToEdit ? "Edit Tracker" : "New Tracker"}
          onCancel={async () => {
            await router.push(`/w/${owner.sId}/assistant/labs/trackers`);
          }}
          onSave={onSubmit}
          isSaving={isSubmitting}
        />
      }
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-16 pb-12">
        <div className="flex">
          <div className="flex flex-grow" />
          <div className="flex flex-shrink-0 flex-col justify-end">
            <AdvancedSettings
              owner={owner}
              plan={subscription.plan}
              generationSettings={{
                modelSettings: {
                  modelId: tracker.modelId,
                  providerId: tracker.providerId,
                },
                temperature: tracker.temperature,
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
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <Page.SectionHeader title="Naming" />
            <div className="text-sm font-normal text-element-700">
              Give your tracker a clear, memorable name and description that
              will help you and your team identify its purpose.
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <Input
                label="Name"
                value={tracker.name || ""}
                onChange={(e) =>
                  setTracker((t) => ({
                    ...t,
                    name: e.target.value,
                    nameError: null,
                  }))
                }
                placeholder="Descriptive name."
                message={tracker.nameError}
                messageStatus={tracker.nameError ? "error" : undefined}
              />
            </div>
            <div className="md:col-span-2">
              <Input
                label="Description"
                value={tracker.description || ""}
                onChange={(e) =>
                  setTracker((t) => ({
                    ...t,
                    description: e.target.value,
                    descriptionError: null,
                  }))
                }
                placeholder="Brief description of what you're tracking and why."
                message={tracker.descriptionError}
                messageStatus={tracker.descriptionError ? "error" : undefined}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <Page.SectionHeader title="Notification Settings" />
            <div className="text-sm font-normal text-element-700">
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
                      label={tracker.frequency}
                      variant="outline"
                      isSelect
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {TRACKER_FREQUENCY_TYPES.map((f) => (
                      <DropdownMenuItem
                        key={f}
                        label={f}
                        onClick={() => {
                          setTracker((t) => ({
                            ...t,
                            frequency: f,
                          }));
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
                onChange={(e) =>
                  setTracker((t) => ({
                    ...t,
                    recipients: e.target.value,
                    recipientsError: null,
                  }))
                }
                message={tracker.recipientsError}
                messageStatus={tracker.recipientsError ? "error" : undefined}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <div>
            <Page.SectionHeader title="Tracker Settings" />
            <div className="text-sm font-normal text-element-700">
              Set up what you want to track and monitor. Tell us what to look
              for, specify which documents to maintain current versions of, and
              select which documents to watch for changes.
            </div>
          </div>
          <div className="flex flex-col space-y-2">
            <Label className="mb-1">Instructions</Label>
            <TextArea
              placeholder="Describe what changes or updates you want to track (be as specific as possible)."
              value={tracker.prompt || ""}
              onChange={(e) =>
                setTracker((t) => ({
                  ...t,
                  prompt: e.target.value,
                  promptError: null,
                }))
              }
              error={tracker.promptError}
              showErrorLabel={!!tracker.promptError}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <div className="flex flex-col space-y-2">
                <Label className="mb-1">Documents to maintain</Label>
                <Button
                  label="Select Documents"
                  onClick={() => {
                    alert("Select Documents");
                  }}
                  className="w-fit"
                />
              </div>
            </div>
            <div className="flex items-end md:col-span-2" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <div className="flex flex-col space-y-2">
                <Label className="mb-1">Documents to watch</Label>
                <Button
                  label="Select Documents"
                  onClick={() => {
                    alert("Select Documents");
                  }}
                  className="w-fit"
                />
              </div>
            </div>
            <div className="flex items-end md:col-span-2" />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};
