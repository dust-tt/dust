import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";
import { CREATABLE_RECORDING_TYPE_OPTIONS } from "@app/lib/triggers/built-in-webhooks/fathom/constants";
import { CheckBoxWithTextAndDescription, Label, Page } from "@dust-tt/sparkle";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { TriggeredFor } from "fathom-typescript/sdk/models/shared";
import { useEffect, useState } from "react";

const CONTENT_OPTIONS = {
  transcript: {
    key: "include_transcript",
    label: msg`Include transcript`,
    description: msg`Include meeting transcript with speaker attribution`,
  },
  summary: {
    key: "include_summary",
    label: msg`Include summary`,
    description: msg`Include AI-generated meeting summary`,
  },
  actionItems: {
    key: "include_action_items",
    label: msg`Include action items`,
    description: msg`Include extracted action items`,
  },
  crm: {
    key: "include_crm_matches",
    label: msg`Include CRM matches`,
    description: msg`Include linked CRM contacts and companies`,
  },
} as const;

export function CreateWebhookFathomConnection({
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
  connectionId,
}: WebhookCreateFormComponentProps) {
  const { t } = useLingui();
  const [selectedRecordingTypes, setSelectedRecordingTypes] = useState<
    TriggeredFor[]
  >(["shared_external_recordings", "shared_team_recordings"]);

  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeActionItems, setIncludeActionItems] = useState(true);
  const [includeCrmMatches, setIncludeCrmMatches] = useState(false);

  const hasAtLeastOneContent =
    includeTranscript ||
    includeSummary ||
    includeActionItems ||
    includeCrmMatches;

  useEffect(() => {
    const isReady = !!(
      connectionId &&
      selectedRecordingTypes.length > 0 &&
      hasAtLeastOneContent
    );

    if (isReady && onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange({
        connectionId,
        remoteMetadata: {
          triggered_for: selectedRecordingTypes,
          include_transcript: includeTranscript,
          include_summary: includeSummary,
          include_action_items: includeActionItems,
          include_crm_matches: includeCrmMatches,
        },
      });
    } else if (onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange(null);
    }

    onReadyToSubmitChange?.(isReady);
  }, [
    connectionId,
    selectedRecordingTypes,
    includeTranscript,
    includeSummary,
    includeActionItems,
    includeCrmMatches,
    hasAtLeastOneContent,
    onDataToCreateWebhookChange,
    onReadyToSubmitChange,
  ]);

  const handleRecordingTypeToggle = (value: TriggeredFor) => {
    setSelectedRecordingTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <Page.H variant="h6">
          <Trans>Configure Fathom webhook</Trans>
        </Page.H>
        <p className="text-element-700 mt-2 text-sm">
          <Trans>
            Select which recordings should trigger webhooks and what content to
            include.
          </Trans>
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="mb-2">
            <Trans>Recording types</Trans>
          </Label>
          <p className="text-element-600 mb-3 text-xs">
            <Trans>Select at least one type of recording to receive</Trans>
          </p>
          <div className="space-y-2">
            {CREATABLE_RECORDING_TYPE_OPTIONS.map((option) => (
              <CheckBoxWithTextAndDescription
                key={option.value}
                text={t(option.label)}
                description={t(option.description)}
                checked={selectedRecordingTypes.includes(option.value)}
                onCheckedChange={() => handleRecordingTypeToggle(option.value)}
              />
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2">
            <Trans>Content options</Trans>
          </Label>
          <p className="text-element-600 mb-3 text-xs">
            <Trans>Select at least one type of content to include</Trans>
          </p>
          <div className="space-y-2">
            <CheckBoxWithTextAndDescription
              text={t(CONTENT_OPTIONS.transcript.label)}
              description={t(CONTENT_OPTIONS.transcript.description)}
              checked={includeTranscript}
              onCheckedChange={(checked) =>
                setIncludeTranscript(checked === true)
              }
            />
            <CheckBoxWithTextAndDescription
              text={t(CONTENT_OPTIONS.summary.label)}
              description={t(CONTENT_OPTIONS.summary.description)}
              checked={includeSummary}
              onCheckedChange={(checked) => setIncludeSummary(checked === true)}
            />
            <CheckBoxWithTextAndDescription
              text={t(CONTENT_OPTIONS.actionItems.label)}
              description={t(CONTENT_OPTIONS.actionItems.description)}
              checked={includeActionItems}
              onCheckedChange={(checked) =>
                setIncludeActionItems(checked === true)
              }
            />
            <CheckBoxWithTextAndDescription
              text={t(CONTENT_OPTIONS.crm.label)}
              description={t(CONTENT_OPTIONS.crm.description)}
              checked={includeCrmMatches}
              onCheckedChange={(checked) =>
                setIncludeCrmMatches(checked === true)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
