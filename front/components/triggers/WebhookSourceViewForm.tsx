import {
  ActionBookOpenIcon,
  ActionIcons,
  Button,
  IconPicker,
  Input,
  Label,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useSendNotification } from "@app/hooks/useNotification";
import {
  useUpdateWebhookSourceView,
  useWebhookSourcesWithViews,
} from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type {
  PatchWebhookSourceViewAndSourceBody,
  WebhookSourceViewType,
} from "@app/types/triggers/webhooks";
import { patchWebhookSourceViewAndSourceBodySchema } from "@app/types/triggers/webhooks";

interface WebhookSourceViewFormProps {
  owner: LightWorkspaceType;
  webhookSourceView: WebhookSourceViewType;
}

export function WebhookSourceViewForm({
  owner,
  webhookSourceView,
}: WebhookSourceViewFormProps) {
  const { updateWebhookSourceView } = useUpdateWebhookSourceView({ owner });
  const sendNotification = useSendNotification();
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  const form = useForm<PatchWebhookSourceViewAndSourceBody>({
    resolver: zodResolver(patchWebhookSourceViewAndSourceBodySchema),
    defaultValues: {
      name:
        webhookSourceView.customName ?? webhookSourceView.webhookSource.name,
      description: webhookSourceView.webhookSource.description,
      icon: webhookSourceView.webhookSource.icon,
    },
  });

  const { mutateWebhookSourcesWithViews } = useWebhookSourcesWithViews({
    owner,
    disabled: true,
  });

  const onSubmit = useCallback(
    async (values: PatchWebhookSourceViewAndSourceBody) => {
      try {
        // Update webhook source view (custom name)
        const viewSuccess = await updateWebhookSourceView(webhookSourceView.sId, {
          name: values.name,
        });

        if (!viewSuccess) {
          throw new Error("Failed to update webhook source view");
        }

        // Update webhook source (description and icon) if they've changed
        if (
          values.description !== webhookSourceView.webhookSource.description ||
          values.icon !== webhookSourceView.webhookSource.icon
        ) {
          const sourceResponse = await fetch(
            `/api/w/${owner.sId}/webhook_sources/${webhookSourceView.webhookSource.sId}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                description: values.description,
                icon: values.icon,
              }),
            }
          );

          if (!sourceResponse.ok) {
            throw new Error("Failed to update webhook source");
          }
        }

        sendNotification({
          type: "success",
          title: "Webhook source updated successfully",
        });

        form.reset(values);
        await mutateWebhookSourcesWithViews();
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to update webhook source",
        });
      }
    },
    [
      updateWebhookSourceView,
      webhookSourceView.sId,
      webhookSourceView.webhookSource.sId,
      webhookSourceView.webhookSource.description,
      webhookSourceView.webhookSource.icon,
      owner.sId,
      form,
      mutateWebhookSourcesWithViews,
      sendNotification,
    ]
  );

  return (
    <div className="space-y-5 text-foreground dark:text-foreground-night">
      <div className="space-y-4">
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <Input
              {...field}
              label="Custom Name"
              isError={!!form.formState.errors.name}
              message={form.formState.errors.name?.message}
              placeholder={webhookSourceView.webhookSource.name}
            />
          )}
        />

        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <>
              <Label htmlFor="description">Description (optional)</Label>
              <TextArea
                {...field}
                value={field.value ?? ""}
                id="description"
                placeholder="Describe the purpose of this webhook source..."
                error={form.formState.errors.description?.message}
                showErrorLabel={true}
                rows={3}
              />
            </>
          )}
        />

        <Controller
          control={form.control}
          name="icon"
          render={({ field }) => {
            const toActionIconKey = (v?: string) =>
              v && v in ActionIcons
                ? (v as keyof typeof ActionIcons)
                : undefined;

            const defaultKey = Object.keys(
              ActionIcons
            )[0] as keyof typeof ActionIcons;
            const selectedIconName =
              toActionIconKey(field.value ?? undefined) ??
              toActionIconKey(webhookSourceView.webhookSource.icon ?? undefined) ??
              defaultKey;
            const IconComponent =
              ActionIcons[selectedIconName] || ActionBookOpenIcon;

            return (
              <div className="space-y-2">
                <Label>Icon</Label>
                <PopoverRoot open={isIconPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={IconComponent}
                      onClick={() => setIsIconPickerOpen(true)}
                      isSelect
                    />
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-fit py-0"
                    onInteractOutside={() => setIsIconPickerOpen(false)}
                    onEscapeKeyDown={() => setIsIconPickerOpen(false)}
                  >
                    <IconPicker
                      icons={ActionIcons}
                      selectedIcon={selectedIconName}
                      onIconSelect={(iconName: string) => {
                        field.onChange(iconName);
                        setIsIconPickerOpen(false);
                      }}
                    />
                  </PopoverContent>
                </PopoverRoot>
              </div>
            );
          }}
        />
      </div>

      {form.formState.isDirty && (
        <div className="flex flex-row items-end justify-end gap-2">
          <Button
            variant="outline"
            label={"Cancel"}
            disabled={form.formState.isSubmitting}
            onClick={() => {
              form.reset();
            }}
          />

          <Button
            variant="highlight"
            label={form.formState.isSubmitting ? "Saving..." : "Save"}
            disabled={form.formState.isSubmitting}
            onClick={async (event: Event) => {
              event.preventDefault();
              void form.handleSubmit(onSubmit)();
            }}
          />
        </div>
      )}
    </div>
  );
}
