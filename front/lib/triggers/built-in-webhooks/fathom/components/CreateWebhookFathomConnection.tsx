import { CheckBoxWithTextAndDescription, Label, Page } from "@dust-tt/sparkle";
import type { TriggeredFor } from "fathom-typescript/sdk/models/shared";
import { useEffect, useState } from "react";

import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";
import { RECORDING_TYPE_OPTIONS } from "@app/lib/triggers/built-in-webhooks/fathom/constants";

const CONTENT_OPTIONS = {
  transcript: {
    key: "include_transcript",
    label: "Include Transcript",
    description: "Include meeting transcript with speaker attribution",
  },
  summary: {
    key: "include_summary",
    label: "Include Summary",
    description: "Include AI-generated meeting summary",
  },
  actionItems: {
    key: "include_action_items",
    label: "Include Action Items",
    description: "Include extracted action items",
  },
  crm: {
    key: "include_crm_matches",
    label: "Include CRM Matches",
    description: "Include linked CRM contacts and companies",
  },
} as const;

export function CreateWebhookFathomConnection({
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
  connectionId,
}: WebhookCreateFormComponentProps) {
  const [selectedRecordingTypes, setSelectedRecordingTypes] = useState<
    TriggeredFor[]
  >(["my_recordings", "shared_external_recordings"]);

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
        <Page.H variant="h6">Configure Fathom Webhook</Page.H>
        <p className="text-element-700 mt-2 text-sm">
          Select which recordings should trigger webhooks and what content to
          include.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="mb-2">Recording Types</Label>
          <p className="text-element-600 mb-3 text-xs">
            Select at least one type of recording to receive
          </p>
          <div className="space-y-2">
            {RECORDING_TYPE_OPTIONS.map((option) => (
              <CheckBoxWithTextAndDescription
                key={option.value}
                text={option.label}
                description={option.description}
                checked={selectedRecordingTypes.includes(option.value)}
                onCheckedChange={() => handleRecordingTypeToggle(option.value)}
              />
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2">Content Options</Label>
          <p className="text-element-600 mb-3 text-xs">
            Select at least one type of content to include
          </p>
          <div className="space-y-2">
            <CheckBoxWithTextAndDescription
              text={CONTENT_OPTIONS.transcript.label}
              description={CONTENT_OPTIONS.transcript.description}
              checked={includeTranscript}
              onCheckedChange={(checked) =>
                setIncludeTranscript(checked === true)
              }
            />
            <CheckBoxWithTextAndDescription
              text={CONTENT_OPTIONS.summary.label}
              description={CONTENT_OPTIONS.summary.description}
              checked={includeSummary}
              onCheckedChange={(checked) => setIncludeSummary(checked === true)}
            />
            <CheckBoxWithTextAndDescription
              text={CONTENT_OPTIONS.actionItems.label}
              description={CONTENT_OPTIONS.actionItems.description}
              checked={includeActionItems}
              onCheckedChange={(checked) =>
                setIncludeActionItems(checked === true)
              }
            />
            <CheckBoxWithTextAndDescription
              text={CONTENT_OPTIONS.crm.label}
              description={CONTENT_OPTIONS.crm.description}
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
