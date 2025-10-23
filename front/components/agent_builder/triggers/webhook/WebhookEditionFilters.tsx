import {
  CollapsibleComponent,
  Label,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useEffect, useMemo, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";
import type { WebhookFormValues } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import { useDebounce } from "@app/hooks/useDebounce";
import { useWebhookFilterGenerator } from "@app/lib/swr/agent_triggers";
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
  const { setError, control } = useFormContext<WebhookFormValues>();
  const selectedEvent = useWatch({ control, name: "event" });

  const selectedEventSchema = useMemo<WebhookEvent | null>(() => {
    if (!selectedEvent || !selectedPreset) {
      return null;
    }

    return (
      selectedPreset.events.find((event) => event.name === selectedEvent) ??
      null
    );
  }, [selectedEvent, selectedPreset]);
  const {
    field: filterField,
    fieldState: { error: filterError },
  } = useController({ control, name: "filter" });
  const {
    field: {
      value: naturalDescriptionValue,
      onChange: onNaturalDescriptionChange,
    },
  } = useController({ control, name: "naturalDescription" });

  const [filterGenerationStatus, setFilterGenerationStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [filterErrorMessage, setFilterErrorMessage] = useState<string | null>(
    null
  );

  const generateFilter = useWebhookFilterGenerator({ workspace });

  const {
    inputValue: naturalDescription,
    debouncedValue: debouncedDescription,
    isDebouncing,
    setValue: setNaturalDescription,
  } = useDebounce(naturalDescriptionValue ?? "", { delay: 500, minLength: 10 });

  // Update form field when naturalDescription changes
  const handleNaturalDescriptionChange = (value: string) => {
    setNaturalDescription(value);
    onNaturalDescriptionChange(value);
  };

  useEffect(() => {
    if (isDebouncing) {
      setFilterGenerationStatus("loading");
    }
  }, [isDebouncing]);

  useEffect(() => {
    if (!debouncedDescription || !selectedEventSchema) {
      if (!debouncedDescription) {
        setFilterGenerationStatus("idle");
        setFilterErrorMessage(null);
      }
      return;
    }

    const generateFilterAsync = async () => {
      setFilterGenerationStatus("loading");
      try {
        const result = await generateFilter({
          naturalDescription: debouncedDescription,
          eventSchema: selectedEventSchema.fields,
        });
        filterField.onChange(result.filter);
        setFilterGenerationStatus("idle");
        setFilterErrorMessage(null);
      } catch (error) {
        setFilterGenerationStatus("error");
        setFilterErrorMessage(
          `Error generating filter: ${normalizeError(error).message}`
        );
      }
    };

    void generateFilterAsync();
  }, [debouncedDescription, selectedEventSchema, generateFilter, filterField]);

  const filterGenerationResult = useMemo(() => {
    switch (filterGenerationStatus) {
      case "idle":
        if (filterField.value) {
          return (
            <CollapsibleComponent
              rootProps={{ defaultOpen: true }}
              triggerChildren={
                <Label className="cursor-pointer">Current filter</Label>
              }
              contentChildren={
                <TriggerFilterRenderer data={filterField.value} />
              }
            />
          );
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
    <>
      {selectedPreset && availableEvents.length > 0 && (
        <>
          <Label htmlFor="webhook-filter-description">
            Filter Description (optional)
          </Label>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Describe in natural language the conditions under which the agent
            should trigger. Will always trigger if left empty.
          </p>
          <TextArea
            id="webhook-filter-description"
            placeholder='e.g. "New pull requests that changes more than 500 lines of code, or have the `auto-review` label."'
            rows={3}
            value={naturalDescription}
            disabled={!isEditor}
            onChange={(e) => {
              if (!selectedEvent || !selectedPreset) {
                setError("event", {
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

      {webhookSourceView?.kind === "custom" && (
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
    </>
  );
}
