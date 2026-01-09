import {
  Button,
  ChevronDownIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  ListSelectIcon,
  SliderToggle,
  TextArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { useForm } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { z } from "zod";

import { CreateWebhookSourceWithProviderForm } from "@app/components/triggers/CreateWebhookSourceWithProviderForm";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import {
  WEBHOOK_PRESETS,
  WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS,
  WebhookSourcesSchema,
} from "@app/types/triggers/webhooks";

export const CreateWebhookSourceSchema = WebhookSourcesSchema.extend({
  autoGenerate: z.boolean().default(true),
})
  .refine(
    ({ provider, subscribedEvents }) =>
      !provider || subscribedEvents.length > 0,
    {
      message: "Subscribed events must not be empty.",
      path: ["subscribedEvents"],
    }
  )
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
        render={({ field, fieldState }) => (
          <Input
            {...field}
            label="Name"
            placeholder="Name..."
            isError={fieldState.error !== undefined}
            message={fieldState.error?.message}
            messageStatus="error"
            autoFocus
          />
        )}
      />
      <Controller
        control={form.control}
        name="description"
        render={({ field }) => (
          <div className="space-y-2">
            <Label htmlFor="trigger-description">Description (optional)</Label>
            <TextArea
              {...field}
              id="trigger-description"
              rows={3}
              placeholder="Help your team understand when to use this trigger."
            />
          </div>
        )}
      />

      {provider && WEBHOOK_PRESETS[provider].events.length > 0 && (
        <Controller
          control={form.control}
          name="subscribedEvents"
          render={({ fieldState }) => {
            const allEvents = WEBHOOK_PRESETS[provider].events;
            const allSelected = selectedEvents.length === allEvents.length;
            const dropDownLabel =
              selectedEvents.length === 0
                ? "Select events"
                : allSelected
                  ? `All events (${selectedEvents.length}) selected`
                  : `${selectedEvents.length} event${selectedEvents.length > 1 ? "s" : ""} selected`;

            const handleSelectAll = () => {
              form.setValue(
                "subscribedEvents",
                allEvents.map((e) => e.value),
                { shouldValidate: true, shouldDirty: true }
              );
            };

            const handleUnselectAll = () => {
              form.setValue("subscribedEvents", [], {
                shouldValidate: true,
                shouldDirty: true,
              });
            };

            return (
              <div className="flex flex-col gap-2">
                <Label htmlFor="subscribedEvents">Events to watch</Label>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Choose which events will activate this trigger
                </p>
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        label={dropDownLabel}
                        variant="outline"
                        icon={ChevronDownIcon}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-72" align="start">
                      <div className="flex gap-2 p-2">
                        <Button
                          label="Select all"
                          icon={ListSelectIcon}
                          variant="primary"
                          size="xs"
                          onClick={handleSelectAll}
                          disabled={allSelected}
                        />
                        <Button
                          label="Unselect all"
                          icon={XMarkIcon}
                          variant="primary"
                          size="xs"
                          onClick={handleUnselectAll}
                          disabled={selectedEvents.length === 0}
                        />
                      </div>
                      <DropdownMenuSeparator />
                      {allEvents.map((event) => {
                        const isSelected = selectedEvents.includes(event.value);
                        return (
                          <DropdownMenuCheckboxItem
                            key={event.value}
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
                            onSelect={(e) => e.preventDefault()}
                            label={event.name}
                          />
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {fieldState.error && (
                  <div className="dark:text-warning-night flex items-center gap-1 text-xs text-warning">
                    {fieldState.error.message}
                  </div>
                )}
              </div>
            );
          }}
        />
      )}

      {provider && (
        <CreateWebhookSourceWithProviderForm
          owner={owner}
          provider={provider}
          onDataToCreateWebhookChange={onRemoteProviderDataChange}
          onReadyToSubmitChange={onPresetReadyToSubmitChange}
        />
      )}

      {!provider && (
        <div>
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger label="Advanced settings" variant="secondary" />
            <CollapsibleContent>
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
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </>
  );
}
