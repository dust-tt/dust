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

import type { LightWorkspaceType } from "@app/types";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import {
  basePostWebhookSourcesSchema,
  refineSubscribedEvents,
  WEBHOOK_PRESETS,
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

export type RemoteProviderData = Record<string, unknown>;

type CreateWebhookSourceFormContentProps = {
  form: ReturnType<typeof useForm<CreateWebhookSourceFormData>>;
  provider: WebhookProvider | null;
  owner: LightWorkspaceType;
  onRemoteProviderDataChange?: (
    data: { connectionId: string; remoteMetadata: RemoteProviderData } | null
  ) => void;
  onPresetReadyToSubmitChange?: (isReady: boolean) => void;
};

export function CreateWebhookSourceFormContent({
  form,
  provider,
  owner,
  onRemoteProviderDataChange,
  onPresetReadyToSubmitChange,
}: CreateWebhookSourceFormContentProps) {
  const selectedEvents = useWatch({
    control: form.control,
    name: "subscribedEvents",
  });

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

      {provider && WEBHOOK_PRESETS[provider].events.length > 0 && (
        <Controller
          control={form.control}
          name="subscribedEvents"
          render={({ fieldState }) => (
            <div className="space-y-3">
              <Label htmlFor="subscribedEvents">Subscribed events</Label>
              <div className="space-y-2">
                {WEBHOOK_PRESETS[provider].events.map((event) => {
                  const isSelected = selectedEvents.includes(event.value);
                  return (
                    <div
                      key={event.value}
                      className="flex items-center space-x-3"
                    >
                      <Checkbox
                        id={`${provider}-event-${event.value}`}
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
                              selectedEvents.filter((e) => e !== event.value),
                              { shouldValidate: true, shouldDirty: true }
                            );
                          }
                        }}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label
                          htmlFor={`${provider}-event-${event.value}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {event.name}
                        </label>
                      </div>
                    </div>
                  );
                })}
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

      {owner &&
        provider &&
        provider !== "test" &&
        (() => {
          const CreateFormComponent =
            WEBHOOK_PRESETS[provider].components.createFormComponent;
          return (
            <CreateFormComponent
              owner={owner}
              onDataToCreateWebhookChange={onRemoteProviderDataChange}
              onReadyToSubmitChange={onPresetReadyToSubmitChange}
            />
          );
        })()}

      {!provider && (
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
