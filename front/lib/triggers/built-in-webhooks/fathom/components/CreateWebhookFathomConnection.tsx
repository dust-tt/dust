import { Checkbox, Label, Page } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";
import { RECORDING_TYPE_OPTIONS } from "@app/lib/triggers/built-in-webhooks/fathom/constants";

const CONTENT_OPTIONS = [
  {
    key: "include_transcript",
    label: "Include Transcript",
    description: "Include meeting transcript with speaker attribution",
  },
  {
    key: "include_summary",
    label: "Include Summary",
    description: "Include AI-generated meeting summary",
  },
  {
    key: "include_action_items",
    label: "Include Action Items",
    description: "Include extracted action items",
  },
  {
    key: "include_crm_matches",
    label: "Include CRM Matches",
    description: "Include linked CRM contacts and companies",
  },
] as const;

export function CreateWebhookFathomConnection({
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
  connectionId,
}: WebhookCreateFormComponentProps) {
  const [selectedRecordingTypes, setSelectedRecordingTypes] = useState<
    string[]
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

  const handleRecordingTypeToggle = (value: string) => {
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
              <div key={option.value} className="flex items-start">
                <Checkbox
                  checked={selectedRecordingTypes.includes(option.value)}
                  onCheckedChange={() =>
                    handleRecordingTypeToggle(option.value)
                  }
                  className="mt-0.5"
                />
                <div className="ml-3">
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-element-600 text-xs">
                    {option.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2">Content Options</Label>
          <p className="text-element-600 mb-3 text-xs">
            Select at least one type of content to include
          </p>
          <div className="space-y-2">
            <div className="flex items-start">
              <Checkbox
                checked={includeTranscript}
                onCheckedChange={(checked) =>
                  setIncludeTranscript(checked === true)
                }
                className="mt-0.5"
              />
              <div className="ml-3">
                <div className="text-sm font-medium">
                  {CONTENT_OPTIONS[0].label}
                </div>
                <div className="text-element-600 text-xs">
                  {CONTENT_OPTIONS[0].description}
                </div>
              </div>
            </div>

            <div className="flex items-start">
              <Checkbox
                checked={includeSummary}
                onCheckedChange={(checked) =>
                  setIncludeSummary(checked === true)
                }
                className="mt-0.5"
              />
              <div className="ml-3">
                <div className="text-sm font-medium">
                  {CONTENT_OPTIONS[1].label}
                </div>
                <div className="text-element-600 text-xs">
                  {CONTENT_OPTIONS[1].description}
                </div>
              </div>
            </div>

            <div className="flex items-start">
              <Checkbox
                checked={includeActionItems}
                onCheckedChange={(checked) =>
                  setIncludeActionItems(checked === true)
                }
                className="mt-0.5"
              />
              <div className="ml-3">
                <div className="text-sm font-medium">
                  {CONTENT_OPTIONS[2].label}
                </div>
                <div className="text-element-600 text-xs">
                  {CONTENT_OPTIONS[2].description}
                </div>
              </div>
            </div>

            <div className="flex items-start">
              <Checkbox
                checked={includeCrmMatches}
                onCheckedChange={(checked) =>
                  setIncludeCrmMatches(checked === true)
                }
                className="mt-0.5"
              />
              <div className="ml-3">
                <div className="text-sm font-medium">
                  {CONTENT_OPTIONS[3].label}
                </div>
                <div className="text-element-600 text-xs">
                  {CONTENT_OPTIONS[3].description}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
