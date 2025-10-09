import {
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

import { getIcon } from "@app/components/resources/resources_icons";
import {
  useUpdateWebhookSourceView,
  useWebhookSourcesWithViews,
} from "@app/lib/swr/webhook_source";
import {
  DEFAULT_WEBHOOK_ICON,
  normalizeWebhookIcon,
} from "@app/lib/webhookSource";
import type { LightWorkspaceType } from "@app/types";
import type {
  PatchWebhookSourceViewBody,
  WebhookSourceView,
} from "@app/types/triggers/webhooks";
import { patchWebhookSourceViewBodySchema } from "@app/types/triggers/webhooks";

interface WebhookSourceViewFormProps {
  owner: LightWorkspaceType;
  webhookSourceView: WebhookSourceView;
}

export function WebhookSourceViewForm({
  owner,
  webhookSourceView,
}: WebhookSourceViewFormProps) {
  const { updateWebhookSourceView } = useUpdateWebhookSourceView({ owner });
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const form = useForm<PatchWebhookSourceViewBody>({
    resolver: zodResolver(patchWebhookSourceViewBodySchema),
    defaultValues: {
      name:
        webhookSourceView.customName ?? webhookSourceView.webhookSource.name,
      description: webhookSourceView.description ?? "",
      icon: webhookSourceView.icon ?? DEFAULT_WEBHOOK_ICON,
    },
  });

  const { mutateWebhookSourcesWithViews } = useWebhookSourcesWithViews({
    owner,
    disabled: true,
  });

  const onSubmit = useCallback(
    async (values: PatchWebhookSourceViewBody) => {
      const success = await updateWebhookSourceView(webhookSourceView.sId, {
        name: values.name,
        description: values.description,
        icon: values.icon,
      });

      if (success) {
        form.reset(values);
        await mutateWebhookSourcesWithViews();
      }
    },
    [
      updateWebhookSourceView,
      webhookSourceView.sId,
      form,
      mutateWebhookSourcesWithViews,
    ]
  );

  const selectedIcon = form.watch("icon");

  const IconComponent = getIcon(normalizeWebhookIcon(selectedIcon));

  return (
    <div className="space-y-5 text-foreground dark:text-foreground-night">
      <div className="space-y-2">
        <Label htmlFor="trigger-name-icon">Name & Icon</Label>
        <div className="flex items-end space-x-2">
          <div className="flex-grow">
            <Controller
              control={form.control}
              name="name"
              render={({ field }) => (
                <Input
                  {...field}
                  id="trigger-name-icon"
                  isError={!!form.formState.errors.name}
                  message={form.formState.errors.name?.message}
                  placeholder={webhookSourceView.webhookSource.name}
                />
              )}
            />
          </div>
          <PopoverRoot open={isPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                icon={IconComponent}
                onClick={() => setIsPopoverOpen(true)}
                isSelect
              />
            </PopoverTrigger>
            <PopoverContent
              className="w-fit py-0"
              onInteractOutside={() => setIsPopoverOpen(false)}
              onEscapeKeyDown={() => setIsPopoverOpen(false)}
            >
              <IconPicker
                icons={ActionIcons}
                selectedIcon={selectedIcon ?? DEFAULT_WEBHOOK_ICON}
                onIconSelect={(iconName: string) => {
                  form.setValue("icon", iconName, { shouldDirty: true });
                  setIsPopoverOpen(false);
                }}
              />
            </PopoverContent>
          </PopoverRoot>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="trigger-description">Description</Label>
        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <TextArea
              {...field}
              id="trigger-description"
              rows={3}
              placeholder="Enter a description for this trigger"
            />
          )}
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
