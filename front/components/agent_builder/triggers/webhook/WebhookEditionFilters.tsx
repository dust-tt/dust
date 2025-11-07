import {
  Button,
  ContentMessage,
  ContentMessageInline,
  Label,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import {
  useTriggerEstimation,
  useWebhookFilterGenerator,
} from "@app/lib/swr/agent_triggers";
import type { LightWorkspaceType } from "@app/types";
import { normalizeError, pluralize } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type {
  PresetWebhook,
  WebhookEvent,
} from "@app/types/triggers/webhooks_source_preset";

interface WebhookEditionFiltersProps {
  isEditor: boolean;
  webhookSourceView: WebhookSourceViewType | null;
  selectedPreset: PresetWebhook | null;
  availableEvents: WebhookEvent[];
  workspace: LightWorkspaceType;
}

const MIN_DESCRIPTION_LENGTH = 10;

export function WebhookEditionFilters({
  isEditor,
  webhookSourceView,
  selectedPreset,
  availableEvents,
  workspace,
}: WebhookEditionFiltersProps) {
  const { setError, control } = useFormContext<TriggerViewsSheetFormValues>();

  const selectedEvent = useWatch({ control, name: "webhook.event" });

  const {
    field: filterField,
    fieldState: { error: filterError },
  } = useController({ control, name: "webhook.filter" });
  const {
    field: {
      value: naturalDescriptionValue,
      onChange: onNaturalDescriptionChange,
    },
  } = useController({ control, name: "webhook.naturalDescription" });

  const [filterGenerationStatus, setFilterGenerationStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [filterErrorMessage, setFilterErrorMessage] = useState<string | null>(
    null
  );

  const { estimation, isEstimationValidating, mutateEstimation } =
    useTriggerEstimation({
      workspaceId: workspace.sId,
      webhookSourceId: webhookSourceView?.webhookSource.sId ?? null,
      filter: filterField.value,
      selectedEvent,
    });

  const generateFilter = useWebhookFilterGenerator({ workspace });

  const handleComputeEstimation = async () => {
    if (!webhookSourceView) {
      return;
    }
    await mutateEstimation();
  };

  const triggerFilterGeneration = useDebounceWithAbort(
    async (txt: string, signal: AbortSignal) => {
      if (
        txt.length < MIN_DESCRIPTION_LENGTH ||
        !selectedEvent ||
        !webhookSourceView ||
        !webhookSourceView.provider
      ) {
        setFilterGenerationStatus("idle");
        return;
      }

      try {
        const result = await generateFilter({
          naturalDescription: txt,
          event: selectedEvent,
          provider: webhookSourceView.provider,
          signal,
        });

        // If the request was not aborted, we can update the form
        if (!signal.aborted) {
          filterField.onChange(result.filter);
          setFilterGenerationStatus("idle");
          setFilterErrorMessage(null);
        }
      } catch (error) {
        // If the request was not aborted, we can update the error state
        if (!signal.aborted) {
          setFilterGenerationStatus("error");
          setFilterErrorMessage(
            `Error generating filter: ${normalizeError(error).message}`
          );
        }
      }
    },
    { delayMs: 500 }
  );

  // Update form field when naturalDescription changes
  const handleNaturalDescriptionChange = (value: string) => {
    onNaturalDescriptionChange(value);

    const txt = value.trim();
    setFilterGenerationStatus(txt ? "loading" : "idle");

    triggerFilterGeneration(txt);
  };

  const filterGenerationResult = useMemo(() => {
    switch (filterGenerationStatus) {
      case "idle":
        if (filterField.value) {
          return <TriggerFilterRenderer data={filterField.value} />;
        }
        return null;
      case "loading":
        return (
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Generating filter...
            </span>
          </div>
        );
      case "error":
        return (
          <ContentMessageInline variant="warning">
            {filterErrorMessage ??
              "Unable to generate filter. Please try rephrasing."}
          </ContentMessageInline>
        );
      default:
        return null;
    }
  }, [filterGenerationStatus, filterErrorMessage, filterField.value]);

  return (
    <div className="space-y-1">
      {selectedPreset && availableEvents.length > 0 && (
        <>
          <Label htmlFor="webhook-filter-description">
            Run only when (optional)
          </Label>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Set conditions that must be met to run the agent.
          </p>
          <TextArea
            id="webhook-filter-description"
            placeholder='Describe the conditions (e.g "Pull requests by John on dust repository")'
            rows={3}
            value={naturalDescriptionValue ?? ""}
            disabled={!isEditor}
            onChange={(e) => {
              if (!selectedEvent || !selectedPreset) {
                setError("webhook.event", {
                  type: "manual",
                  message: "Please select an event first",
                });
                return;
              }

              handleNaturalDescriptionChange(e.target.value);
            }}
          />
        </>
      )}

      {!webhookSourceView?.provider && (
        <div className="space-y-2">
          <Label htmlFor="webhook-filter-description">
            Filter Expression (optional)
          </Label>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Enter a filter that will be used to filter the webhook payload JSON.
            Will always trigger if left empty.
          </p>
          <ContentMessage
            variant="highlight"
            size="lg"
            title="Payload filtering Syntax"
          >
            This trigger uses a custom webhook without an integrated provider.
            As a result, Dust is unable to automatically generate a payload
            filter. You can manually write a filter expression using our syntax
            to specify conditions on your webhook's payload.
            <br />
            See documentation on{" "}
            <Link
              href="https://docs.dust.tt/docs/filter-webhooks-payload#/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              filter expressions
            </Link>{" "}
            to learn how to write them.
          </ContentMessage>
          <TextArea
            id="webhook-filter-description"
            placeholder={
              'example:\n\n(and\n  (eq "action" "opened")\n  (exists "pull_request")\n)'
            }
            rows={6}
            {...filterField}
            disabled={!isEditor}
            error={filterError?.message}
          />
        </div>
      )}

      <div className="py-2">{filterGenerationResult}</div>

      {webhookSourceView && (
        <Button
          label="Compute stats"
          size="sm"
          variant="outline"
          onClick={handleComputeEstimation}
          disabled={isEstimationValidating || !isEditor}
          isLoading={isEstimationValidating}
        />
      )}

      {estimation && (
        <>
          {estimation.totalCount < 10 ? (
            <ContentMessageInline variant="warning">
              Not enough data to compute statistics. {estimation.totalCount}{" "}
              event{pluralize(estimation.totalCount)} found in the last 24
              hours. At least 10 events are needed for estimation.
            </ContentMessageInline>
          ) : (
            <ContentMessageInline variant="outline">
              According to the most recent data, this trigger would have created{" "}
              <span className="font-semibold">{estimation.matchingCount}</span>{" "}
              conversations out of{" "}
              <span className="font-semibold">{estimation.totalCount}</span>{" "}
              events in the last 24 hours.
            </ContentMessageInline>
          )}
        </>
      )}
    </div>
  );
}
