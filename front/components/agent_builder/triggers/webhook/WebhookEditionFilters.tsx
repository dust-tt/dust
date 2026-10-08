import { TriggerFilterRenderer } from "@app/components/agent_builder/triggers/TriggerFilterRenderer";
import type { TriggerViewsSheetFormValues } from "@app/components/agent_builder/triggers/triggerViewsSheetFormSchema";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { formatError } from "@app/lib/api_error_messages";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  useTriggerEstimation,
  useWebhookFilterGenerator,
} from "@app/lib/swr/agent_triggers";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type {
  WebhookEventMetadata,
  WebhookPresetMetadata,
} from "@app/types/triggers/webhooks_source_preset";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  ContentMessageInline,
  Label,
  LinkWrapper,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

interface WebhookEditionFiltersProps {
  isEditor: boolean;
  webhookSourceView: WebhookSourceViewType | null;
  selectedPreset: WebhookPresetMetadata | null;
  availableEvents: WebhookEventMetadata[];
  workspace: LightWorkspaceType;
}

const MIN_DESCRIPTION_LENGTH = 10;

const FILTER_EXPRESSION_EXAMPLE =
  '(and\n  (eq "action" "opened")\n  (exists "pull_request")\n)';

export function WebhookEditionFilters({
  isEditor,
  webhookSourceView,
  selectedPreset,
  availableEvents,
  workspace,
}: WebhookEditionFiltersProps) {
  const { t } = useLingui();
  const { setError, control } = useFormContext<TriggerViewsSheetFormValues>();
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");

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
          const errorMessage = formatError(error, {
            hasLocalisation,
          }).description;
          setFilterErrorMessage(t`Error generating filter: ${errorMessage}`);
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
            <span className="text-sm text-muted-foreground">
              <Trans>Generating filter...</Trans>
            </span>
          </div>
        );
      case "error":
        return (
          <ContentMessageInline variant="warning">
            {filterErrorMessage ??
              t`Unable to generate filter. Please try rephrasing.`}
          </ContentMessageInline>
        );
      default:
        return null;
    }
  }, [filterGenerationStatus, filterErrorMessage, filterField.value, t]);

  return (
    <div className="space-y-1">
      {selectedPreset && availableEvents.length > 0 && (
        <>
          <Label htmlFor="webhook-filter-description">
            <Trans>Run only when (optional)</Trans>
          </Label>
          <p className="text-sm text-muted-foreground">
            <Trans>Set conditions that must be met to run the agent.</Trans>
          </p>
          <TextArea
            id="webhook-filter-description"
            placeholder={t`Describe the conditions (e.g "Pull requests by John on dust repository")`}
            rows={3}
            value={naturalDescriptionValue ?? ""}
            disabled={!isEditor}
            onChange={(e) => {
              if (!selectedEvent || !selectedPreset) {
                setError("webhook.event", {
                  type: "manual",
                  message: t`Please select an event first`,
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
            <Trans>Filter expression (optional)</Trans>
          </Label>
          <p className="text-sm text-muted-foreground">
            <Trans>
              Enter a filter that will be used to filter the webhook payload
              JSON. Will always trigger if left empty.
            </Trans>
          </p>
          <ContentMessage
            variant="highlight"
            size="lg"
            title={t`Payload filtering syntax`}
          >
            <Trans>
              This trigger uses a custom webhook without an integrated provider.
              As a result, Dust is unable to automatically generate a payload
              filter. You can manually write a filter expression using our
              syntax to specify conditions on your webhook's payload.
            </Trans>
            <br />
            <Trans>
              See documentation on{" "}
              <LinkWrapper
                href="https://docs.dust.tt/docs/filter-webhooks-payload#/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                filter expressions
              </LinkWrapper>{" "}
              to learn how to write them.
            </Trans>
          </ContentMessage>
          <TextArea
            id="webhook-filter-description"
            placeholder={t`Example:\n\n${FILTER_EXPRESSION_EXAMPLE}`}
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
          label={t`Compute stats`}
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
              <Trans>Not enough data to compute statistics.</Trans>{" "}
              <Plural
                value={estimation.totalCount}
                one="# event found in the last 24 hours."
                other="# events found in the last 24 hours."
              />{" "}
              <Trans>At least 10 events are needed for estimation.</Trans>
            </ContentMessageInline>
          ) : (
            <ContentMessageInline variant="outline">
              <Trans>
                According to the most recent data, this trigger would have
                created{" "}
                <span className="font-semibold">
                  <Plural
                    value={estimation.matchingCount}
                    one="# conversation"
                    other="# conversations"
                  />
                </span>{" "}
                out of{" "}
                <span className="font-semibold">
                  <Plural
                    value={estimation.totalCount}
                    one="# event"
                    other="# events"
                  />
                </span>{" "}
                in the last 24 hours.
              </Trans>
            </ContentMessageInline>
          )}
        </>
      )}
    </div>
  );
}
