import { Button, Input, Label, Page, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

interface SlackConfigurationProps {
  owner: LightWorkspaceType;
  agents: LightAgentConfigurationType[];
  selectedAgent: LightAgentConfigurationType | null;
  channelId: string;
  isEnabled: boolean;
  onAgentSelect: (agent: LightAgentConfigurationType) => void;
  onChannelIdChange: (channelId: string) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onSave: () => void;
  isSaving?: boolean;
}

export function SlackConfiguration({
  owner,
  agents,
  selectedAgent,
  channelId,
  isEnabled,
  onAgentSelect,
  onChannelIdChange,
  onToggleEnabled,
  onSave,
  isSaving = false,
}: SlackConfigurationProps) {
  const [localChannelId, setLocalChannelId] = useState(channelId);

  const handleChannelIdChange = (value: string) => {
    setLocalChannelId(value);
    onChannelIdChange(value);
  };

  return (
    <Page.Layout direction="vertical">
      <Page.SectionHeader
        title="Configure message processing"
        description="Select an agent and channel to automatically process new messages"
      />

      <Page.Layout direction="vertical" gap="xl">
        <Page.Layout direction="vertical" gap="lg">
          <div className="space-y-3">
            <Label>Select an agent: </Label>
            <AssistantPicker
              owner={owner}
              assistants={agents}
              onItemClick={onAgentSelect}
              showFooterButtons={false}
              size="sm"
            />
            {selectedAgent && (
              <Page.P variant="secondary">
                <strong>@{selectedAgent.name}</strong> - The agent that will
                process messages in your Slack channel.
              </Page.P>
            )}
          </div>
        </Page.Layout>

        <Page.Layout direction="vertical" gap="lg">
          <div className="space-y-3">
            <Label>Slack Channel ID</Label>
            <Input
              value={localChannelId}
              onChange={(e) => handleChannelIdChange(e.target.value)}
              placeholder="C0123456789"
              name="channelId"
            />
            <Page.P variant="secondary">
              From Slack, open channel details → About → Channel ID.
            </Page.P>
          </div>
        </Page.Layout>

        <Page.Layout direction="vertical" gap="lg">
          <Page.Layout direction="horizontal" gap="md">
            <SliderToggle
              selected={isEnabled}
              onClick={() => onToggleEnabled(!isEnabled)}
              disabled={!selectedAgent || !localChannelId.trim()}
            />
            <Page.P>Enable automatic message processing</Page.P>
          </Page.Layout>
        </Page.Layout>

        <Page.Layout direction="vertical" gap="lg">
          <div className="pt-2">
            <Button
              variant="primary"
              label={isSaving ? "Saving..." : "Save Configuration"}
              onClick={onSave}
              disabled={isSaving || !selectedAgent || !localChannelId.trim()}
            />
          </div>
        </Page.Layout>
      </Page.Layout>
    </Page.Layout>
  );
}
