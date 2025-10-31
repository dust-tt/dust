import { Label, Spinner, TextArea } from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";
import { useWebhookFilterGenerator } from "@app/lib/swr/agent_triggers";
import { debounce } from "@app/lib/utils/debounce";
import type { LightWorkspaceType } from "@app/types";
import { normalizeError } from "@app/types";
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

export function WebhookEditionFilters({
  isEditor,
  webhookSourceView,
  selectedPreset,
  availableEvents,
  workspace,
}: WebhookEditionFiltersProps) {
  const { setError, control } = useFormContext();

  const selectedEvent = useWatch({ control, name: "webhook.event" });

  const selectedEventSchema = useMemo<WebhookEvent | null>(() => {
    if (!selectedEvent || !selectedPreset) {
      return null;
    }

    return (
      selectedPreset.events.find((event) => event.value === selectedEvent) ??
      null
    );
  }, [selectedEvent, selectedPreset]);
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

  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  const generateFilter = useWebhookFilterGenerator({ workspace });

  const MIN_DESCRIPTION_LENGTH = 10;

  // Update form field when naturalDescription changes
  const handleNaturalDescriptionChange = (value: string) => {
    onNaturalDescriptionChange(value);

    const txt = value.trim();
    setFilterGenerationStatus(txt ? "loading" : "idle");

    if (txt.length >= MIN_DESCRIPTION_LENGTH) {
      debounce(
        debounceHandle,
        async () => {
          // Cancel previous request
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }

          abortControllerRef.current = new AbortController();
          const signal = abortControllerRef.current.signal;

          if (!selectedEventSchema) {
            setFilterGenerationStatus("idle");
            return;
          }

          try {
            const result = await generateFilter({
              naturalDescription: txt,
              eventSchema: selectedEventSchema,
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
        500
      );
    } else {
      if (debounceHandle.current) {
        clearTimeout(debounceHandle.current);
        debounceHandle.current = undefined;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
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
          <p className="text-sm text-warning">
            {filterErrorMessage ??
              "Unable to generate filter. Please try rephrasing."}
          </p>
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

      {webhookSourceView?.provider === null && (
        <>
          <Label htmlFor="webhook-filter-description">
            Filter Expression (optional)
          </Label>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Enter a filter that will be used to filter the webhook payload JSON.
            Will always trigger if left empty.
          </p>
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
        </>
      )}

      <div className="pt-2">{filterGenerationResult}</div>
    </div>
  );
}
