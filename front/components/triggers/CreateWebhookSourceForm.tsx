import { CreateWebhookSourceWithProviderForm } from "@app/components/triggers/CreateWebhookSourceWithProviderForm";
import { WEBHOOK_PRESETS } from "@app/lib/triggers/webhook_presets";
import {
  WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS,
  WebhookSourcesSchema,
} from "@app/lib/triggers/webhooks";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ChevronDown,
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
  ListSelect,
  SliderToggle,
  TextArea,
  XClose,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import type { useForm } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { z } from "zod";

export function useCreateWebhookSourceSchema() {
  const { t } = useLingui();

  return useMemo(
    () =>
      WebhookSourcesSchema.extend({
        name: z.string().min(1, t`Name is required`),
        autoGenerate: z.boolean().default(true),
      })
        .refine(
          ({ provider, subscribedEvents }) =>
            !provider || subscribedEvents.length > 0,
          {
            message: t`Subscribed events must not be empty.`,
            path: ["subscribedEvents"],
          }
        )
        .refine(
          (data) => data.autoGenerate || (data.secret ?? "").trim().length > 0,
          {
            message: t`Secret is required`,
            path: ["secret"],
          }
        ),
    [t]
  );
}

export type CreateWebhookSourceFormData = z.infer<
  ReturnType<typeof useCreateWebhookSourceSchema>
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
  const { t } = useLingui();
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
            label={t`Name`}
            placeholder={t`Name...`}
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
            <Label htmlFor="trigger-description">
              <Trans>Description (optional)</Trans>
            </Label>
            <TextArea
              {...field}
              id="trigger-description"
              rows={3}
              placeholder={t`Help your team understand when to use this trigger.`}
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
            const selectedCount = selectedEvents.length;
            const dropDownLabel =
              selectedCount === 0
                ? t`Select events`
                : allSelected
                  ? t`All events (${selectedCount}) selected`
                  : t`${plural(selectedCount, {
                      one: "# event selected",
                      other: "# events selected",
                    })}`;

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
                <Label htmlFor="subscribedEvents">
                  <Trans>Events to watch</Trans>
                </Label>
                <p className="text-sm text-muted-foreground">
                  <Trans>Choose which events will activate this trigger</Trans>
                </p>
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        label={dropDownLabel}
                        variant="outline"
                        icon={ChevronDown}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-72" align="start">
                      <div className="flex gap-2 p-2">
                        <Button
                          label={t`Select all`}
                          icon={ListSelect}
                          variant="primary"
                          size="xs"
                          onClick={handleSelectAll}
                          disabled={allSelected}
                        />
                        <Button
                          label={t`Unselect all`}
                          icon={XClose}
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
                  <div className="flex items-center gap-1 text-xs text-warning">
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
            <CollapsibleTrigger
              label={t`Advanced settings`}
              variant="secondary"
            />
            <CollapsibleContent>
              <div className="flex flex-col space-y-2">
                <Label>
                  <Trans>Secret</Trans>
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  <i>
                    <Trans>
                      Note: You will be able to see and copy this secret for the
                      first 10 minutes after creating the webhook.
                    </Trans>
                  </i>
                </p>
                <div className="mb-3 flex items-center justify-between">
                  <Label>
                    <Trans>Auto-generate</Trans>
                  </Label>
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
                          placeholder={t`Secret for validation...`}
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
                      label={t`Signature header`}
                      placeholder={t`Signature header...`}
                      isError={
                        form.formState.errors.signatureHeader !== undefined
                      }
                      message={form.formState.errors.signatureHeader?.message}
                      messageStatus="error"
                    />
                  )}
                />
                <div className="flex items-center justify-between space-y-2">
                  <Label>
                    <Trans>Signature algorithm</Trans>
                  </Label>
                  <Controller
                    control={form.control}
                    name="signatureAlgorithm"
                    render={({ field }) => (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            label={field.value}
                            variant="outline"
                            // oxlint-disable-next-line dust/noCssImportant -- legacy [no-css-important]
                            className="mt-0!"
                            icon={ChevronDown}
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
