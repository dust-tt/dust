import { InteractiveContentSharingToggle } from "@app/components/workspace/settings/InteractiveContentSharingToggle";
import { RestrictAgentsPublishingCapability } from "@app/components/workspace/settings/RestrictAgentsPublishingCapability";
import { VoiceTranscriptionToggle } from "@app/components/workspace/settings/VoiceTranscriptionToggle";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, Page } from "@dust-tt/sparkle";

export function CapabilitiesSection({
  owner,
  publishingRestrictionMessage,
}: {
  owner: WorkspaceType;
  publishingRestrictionMessage: string | null;
}) {
  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.H variant="h4">Capabilities</Page.H>
      <ContextItem.List>
        <div className="h-full border-b border-border dark:border-border-night" />
        <InteractiveContentSharingToggle owner={owner} />
        <VoiceTranscriptionToggle owner={owner} />
        {publishingRestrictionMessage && (
          <RestrictAgentsPublishingCapability
            subElement={publishingRestrictionMessage}
          />
        )}
      </ContextItem.List>
    </Page.Vertical>
  );
}
