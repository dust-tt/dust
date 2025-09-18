import { Button, Input } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";

import { useUpdateWebhookSourceView } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type {
  PatchWebhookSourceViewBody,
  WebhookSourceViewType,
} from "@app/types/triggers/webhooks";
import { patchWebhookSourceViewBodySchema } from "@app/types/triggers/webhooks";

interface WebhookSourceViewFormProps {
  owner: LightWorkspaceType;
  webhookSourceView: WebhookSourceViewType;
}

export function WebhookSourceViewForm({
  owner,
  webhookSourceView,
}: WebhookSourceViewFormProps) {
  const { updateWebhookSourceView } = useUpdateWebhookSourceView({ owner });

  const form = useForm<PatchWebhookSourceViewBody>({
    resolver: zodResolver(patchWebhookSourceViewBodySchema),
    defaultValues: {
      name:
        webhookSourceView.customName ?? webhookSourceView.webhookSource.name,
    },
  });

  const onSubmit = useCallback(
    async (values: PatchWebhookSourceViewBody) => {
      const success = await updateWebhookSourceView(webhookSourceView.sId, {
        name: values.name,
      });

      if (success) {
        form.reset(values);
      }
    },
    [updateWebhookSourceView, webhookSourceView.sId, form]
  );

  return (
    <div className="space-y-5 text-foreground dark:text-foreground-night">
      <div className="flex items-end space-x-2">
        <div className="flex-grow">
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
        </div>
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
