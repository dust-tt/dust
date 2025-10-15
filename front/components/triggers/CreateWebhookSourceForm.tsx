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
  TextArea,
} from "@dust-tt/sparkle";
import type { useForm } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { z } from "zod";

import { CreateWebhookGithubConnection } from "@app/components/triggers/CreateWebhookGithubConnection";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";
import {
  basePostWebhookSourcesSchema,
  refineSubscribedEvents,
  WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP,
  WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS,
} from "@app/types/triggers/webhooks";

export const validateCustomHeadersFromString = (value: string | null) => {
  if (value === null || value.trim() === "") {
    return { parsed: null };
  }
  try {
    const parsed = JSON.parse(value);
    const result = z.record(z.string()).nullable().safeParse(parsed);

    return result.success ? { parsed: result.data } : null;
  } catch {
    return null;
  }
};

export const CreateWebhookSourceSchema = basePostWebhookSourcesSchema
  .extend({
    customHeaders: z
      .string()
      .nullable()
      .refine(validateCustomHeadersFromString, "Invalid JSON format"),
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
  repository: string;
};

export type RemoteProviderData = RemoteGithubData;

type CreateWebhookSourceFormContentProps = {
  form: ReturnType<typeof useForm<CreateWebhookSourceFormData>>;
  kind: WebhookSourceKind;
  owner?: LightWorkspaceType;
  onRemoteProviderDataChange?: (data: RemoteProviderData | null) => void;
};

export function CreateWebhookSourceFormContent({
  form,
  kind,
  owner,
  onRemoteProviderDataChange,
}: CreateWebhookSourceFormContentProps) {
  const selectedEvents = useWatch({
    control: form.control,
    name: "subscribedEvents",
  });

  const isGithub = kind === "github";
  const isCustom = !isGithub;

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

      {isGithub && owner && (
        <CreateWebhookGithubConnection
          owner={owner}
          onGithubDataChange={onRemoteProviderDataChange}
        />
      )}

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

      {isCustom && (
        <Controller
          control={form.control}
          name="customHeaders"
          render={({ field }) => (
            <div>
              <Label htmlFor="customHeaders">Custom Headers (optional)</Label>
              <TextArea
                {...field}
                value={field.value ?? undefined}
                id="customHeaders"
                placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                error={form.formState.errors.customHeaders?.message}
                showErrorLabel={true}
                rows={4}
              />
            </div>
          )}
        />
      )}
    </>
  );
}
