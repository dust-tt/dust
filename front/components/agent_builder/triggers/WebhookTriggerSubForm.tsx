import {
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { TriggerFormData } from "@app/components/agent_builder/triggers/triggerFormSchema";
import { useWebhookSourcesWithViews } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";

interface WebhookTriggerSubFormProps {
  owner: LightWorkspaceType;
  isEditor: boolean;
}

type WebhookOption = {
  value: string;
  label: string;
  sourceName: string;
  spaceName: string | null;
};

export function WebhookTriggerSubForm({
  owner,
  isEditor,
}: WebhookTriggerSubFormProps) {
  const form = useFormContext<TriggerFormData>();
  const selectedViewSId = form.watch("webhookSourceViewSId") ?? "";
  const includePayload = form.watch("includePayload");

  const { spaces } = useSpacesContext();
  const { webhookSourcesWithViews, isWebhookSourcesWithViewsLoading } =
    useWebhookSourcesWithViews({ owner });

  const spaceById = useMemo(() => {
    return new Map(spaces.map((space) => [space.sId, space.name]));
  }, [spaces]);

  const accessibleSpaceIds = useMemo(
    () => new Set(spaceById.keys()),
    [spaceById]
  );

  const webhookOptions = useMemo((): WebhookOption[] => {
    return webhookSourcesWithViews
      .flatMap((source) =>
        source.views
          .filter((view) => accessibleSpaceIds.has(view.spaceId))
          .map((view) => ({
            value: view.sId,
            label: view.customName ?? source.name,
            sourceName: source.name,
            spaceName: spaceById.get(view.spaceId) ?? null,
          }))
      )
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [accessibleSpaceIds, spaceById, webhookSourcesWithViews]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground dark:text-foreground-night">
          Webhook source
        </Label>
        {isWebhookSourcesWithViewsLoading ? (
          <div className="flex h-20 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : webhookOptions.length === 0 ? (
          <ContentMessage variant="outline">
            No webhook sources available. Make sure you have access to a webhook
            source in one of your spaces.
          </ContentMessage>
        ) : (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                label={
                  selectedViewSId
                    ? webhookOptions.find(
                        (opt) => opt.value === selectedViewSId
                      )?.label ?? "Select webhook source"
                    : "Select webhook source"
                }
                variant="outline"
                isSelect
                disabled={!isEditor}
                className="w-full justify-between"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-full">
              {webhookOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  label={option.label}
                  description={`${option.sourceName}${option.spaceName ? ` • ${option.spaceName}` : ""}`}
                  onClick={() => {
                    if (!isEditor) {
                      return;
                    }
                    form.setValue("webhookSourceViewSId", option.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {"webhookSourceViewSId" in form.formState.errors &&
          form.formState.errors.webhookSourceViewSId && (
            <p className="text-destructive dark:text-destructive-night text-sm">
              {form.formState.errors.webhookSourceViewSId.message}
            </p>
          )}
      </div>

      <div className="flex items-start justify-between gap-4 rounded-md border border-border-dark p-3 dark:border-border-dark-night">
        <div>
          <Label className="block text-sm font-medium text-foreground dark:text-foreground-night">
            Include webhook payload
          </Label>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            When enabled, the webhook payload is attached to the run as a
            content fragment.
          </p>
        </div>
        <SliderToggle
          selected={includePayload}
          disabled={!isEditor}
          onClick={() => {
            if (!isEditor) {
              return;
            }
            form.setValue("includePayload", !includePayload, {
              shouldDirty: true,
            });
          }}
        />
      </div>
    </div>
  );
}
