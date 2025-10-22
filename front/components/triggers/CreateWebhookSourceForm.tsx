import {
  Button,
  Checkbox,
  ChevronDownIcon,
  CollapsibleComponent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { useForm } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { z } from "zod";

import type { ComponentType } from "react";

import { CreateWebhookGithubConnection } from "@app/components/triggers/CreateWebhookGithubConnection";
import { CreateWebhookTestConnection } from "@app/components/triggers/CreateWebhookTestConnection";
import { useWebhookServiceData } from "@app/lib/swr/useWebhookServiceData";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";
import {
  basePostWebhookSourcesSchema,
  refineSubscribedEvents,
  WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP,
  WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS,
} from "@app/types/triggers/webhooks";

export const CreateWebhookSourceSchema = basePostWebhookSourcesSchema
  .extend({
    autoGenerate: z.boolean().default(true),
  })
  .refine(...refineSubscribedEvents)
  .refine(
    (data) => data.autoGenerate || (data.secret ?? "").trim().length > 0,
    {
      message: "Secret is required",
      path: ["secret"],
    }
  );

export type CreateWebhookSourceFormData = z.infer<
  typeof CreateWebhookSourceSchema
>;

export type BaseRemoteData = {
  connectionId: string;
};

export type RemoteGithubData = BaseRemoteData & {
  repositories: string[];
  organizations: string[];
};

export type RemoteProviderData = RemoteGithubData;

type CreateWebhookSourceFormContentProps = {
  form: ReturnType<typeof useForm<CreateWebhookSourceFormData>>;
  kind: WebhookSourceKind;
  owner?: LightWorkspaceType;
  onRemoteProviderDataChange?: (data: RemoteProviderData | null) => void;
  onPresetReadyToSubmitChange?: (isReady: boolean) => void;
};

// Component wrapper for GitHub - uses literal type for proper inference
function GitHubConnectionWrapper({
  owner,
  onRemoteProviderDataChange,
  onReadyToSubmitChange,
}: {
  owner: LightWorkspaceType;
  onRemoteProviderDataChange?: (data: RemoteProviderData | null) => void;
  onReadyToSubmitChange?: (isReady: boolean) => void;
}) {
  const { serviceData, isFetchingServiceData, fetchServiceData } =
    useWebhookServiceData(owner, "github");

  return (
    <CreateWebhookGithubConnection
      owner={owner}
      serviceData={serviceData}
      isFetchingServiceData={isFetchingServiceData}
      onFetchServiceData={fetchServiceData}
      onGithubDataChange={onRemoteProviderDataChange}
      onReadyToSubmitChange={onReadyToSubmitChange}
    />
  );
}

// Component wrapper for Test - uses literal type for proper inference
function TestConnectionWrapper({
  owner,
  onRemoteProviderDataChange,
  onReadyToSubmitChange,
}: {
  owner: LightWorkspaceType;
  onRemoteProviderDataChange?: (data: RemoteProviderData | null) => void;
  onReadyToSubmitChange?: (isReady: boolean) => void;
}) {
  const { serviceData, isFetchingServiceData, fetchServiceData } =
    useWebhookServiceData(owner, "test");

  return (
    <CreateWebhookTestConnection
      owner={owner}
      serviceData={serviceData}
      isFetchingServiceData={isFetchingServiceData}
      onFetchServiceData={fetchServiceData}
      onTestDataChange={(data) => {
        if (onRemoteProviderDataChange && data) {
          onRemoteProviderDataChange({
            connectionId: data.connectionId,
            repositories: [],
            organizations: [],
          });
        } else if (onRemoteProviderDataChange) {
          onRemoteProviderDataChange(null);
        }
      }}
      onReadyToSubmitChange={onReadyToSubmitChange}
    />
  );
}

// Map from kind to wrapper component - this is the central registry
const WEBHOOK_CONNECTION_COMPONENTS = {
  github: GitHubConnectionWrapper,
  test: TestConnectionWrapper,
} as const satisfies Record<
  Exclude<WebhookSourceKind, "custom">,
  ComponentType<{
    owner: LightWorkspaceType;
    onRemoteProviderDataChange?: (data: RemoteProviderData | null) => void;
    onReadyToSubmitChange?: (isReady: boolean) => void;
  }>
>;

export function CreateWebhookSourceFormContent({
  form,
  kind,
  owner,
  onRemoteProviderDataChange,
  onPresetReadyToSubmitChange,
}: CreateWebhookSourceFormContentProps) {
  const selectedEvents = useWatch({
    control: form.control,
    name: "subscribedEvents",
  });

  const isCustom = kind === "custom";

  return (
    <>
      <Controller
        control={form.control}
        name="name"
        render={({ field }) => (
          <Input
            {...field}
            label="Name"
            placeholder="Name..."
            isError={form.formState.errors.name !== undefined}
            message={form.formState.errors.name?.message}
            messageStatus="error"
            autoFocus
          />
        )}
      />

      {kind !== "custom" &&
        WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind].events.length > 0 && (
          <Controller
            control={form.control}
            name="subscribedEvents"
            render={({ fieldState }) => (
              <div className="space-y-3">
                <Label htmlFor="subscribedEvents">Subscribed events</Label>
                <div className="space-y-2">
                  {WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind].events.map(
                    (event) => {
                      const isSelected = selectedEvents.includes(event.value);
                      return (
                        <div
                          key={event.value}
                          className="flex items-center space-x-3"
                        >
                          <Checkbox
                            id={`${kind}-event-${event.value}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                form.setValue(
                                  "subscribedEvents",
                                  [...selectedEvents, event.value],
                                  { shouldValidate: true, shouldDirty: true }
                                );
                              } else {
                                form.setValue(
                                  "subscribedEvents",
                                  selectedEvents.filter(
                                    (e) => e !== event.value
                                  ),
                                  { shouldValidate: true, shouldDirty: true }
                                );
                              }
                            }}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor={`${kind}-event-${event.value}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {event.name}
                            </label>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
                {fieldState.error && (
                  <div className="dark:text-warning-night flex items-center gap-1 text-xs text-warning">
                    {fieldState.error.message}
                  </div>
                )}
              </div>
            )}
          />
        )}

      {!isCustom && owner && (() => {
        // Use the component map to dynamically render the right connection component
        // TypeScript knows kind is not "custom" here due to !isCustom check
        const ConnectionComponent = WEBHOOK_CONNECTION_COMPONENTS[kind as keyof typeof WEBHOOK_CONNECTION_COMPONENTS];
        return ConnectionComponent ? (
          <ConnectionComponent
            owner={owner}
            onRemoteProviderDataChange={onRemoteProviderDataChange}
            onReadyToSubmitChange={onPresetReadyToSubmitChange}
          />
        ) : null;
      })()}

      {isCustom && (
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen: false }}
            triggerProps={{ label: "Advanced settings", variant: "secondary" }}
            contentChildren={
              <div className="flex flex-col space-y-2">
                <Label>Secret</Label>
                <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                  <i>
                    Note: You will be able to see and copy this secret for the
                    first 10 minutes after creating the webhook.
                  </i>
                </p>
                <div className="mb-3 flex items-center justify-between">
                  <Label>Auto-generate</Label>
                  <Controller
                    control={form.control}
                    name="autoGenerate"
                    render={({ field }) => (
                      <SliderToggle
                        selected={field.value}
                        onClick={() => {
                          const next = !field.value;
                          field.onChange(next);
                          if (next) {
                            form.setValue("secret", "");
                          }
                        }}
                      />
                    )}
                  />
                </div>
                {!form.watch("autoGenerate") && (
                  <Controller
                    control={form.control}
                    name="secret"
                    render={({ field }) => (
                      <div className="mt-2">
                        <Input
                          {...field}
                          id="secret"
                          type="password"
                          placeholder="Secret for validation..."
                          isError={form.formState.errors.secret !== undefined}
                          message={form.formState.errors.secret?.message}
                          messageStatus="error"
                        />
                      </div>
                    )}
                  />
                )}
                <Controller
                  control={form.control}
                  name="signatureHeader"
                  render={({ field }) => (
                    <Input
                      {...field}
                      label="Signature Header"
                      placeholder="Signature header..."
                      isError={
                        form.formState.errors.signatureHeader !== undefined
                      }
                      message={form.formState.errors.signatureHeader?.message}
                      messageStatus="error"
                    />
                  )}
                />
                <div className="flex items-center justify-between space-y-2">
                  <Label>Signature Algorithm</Label>
                  <Controller
                    control={form.control}
                    name="signatureAlgorithm"
                    render={({ field }) => (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            label={field.value}
                            variant="outline"
                            className="!mt-0"
                            icon={ChevronDownIcon}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS.map(
                            (algorithm) => (
                              <DropdownMenuItem
                                key={algorithm}
                                onClick={() => field.onChange(algorithm)}
                              >
                                {algorithm}
                              </DropdownMenuItem>
                            )
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  />
                </div>
              </div>
            }
          />
        </div>
      )}
    </>
  );
}
