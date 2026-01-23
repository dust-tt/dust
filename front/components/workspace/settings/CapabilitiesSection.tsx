import { ContextItem, Page } from "@dust-tt/sparkle";

import { InteractiveContentSharingToggle } from "@app/components/workspace/settings/InteractiveContentSharingToggle";
import { RestrictAgentsPublishingCapability } from "@app/components/workspace/settings/RestrictAgentsPublishingCapability";
import { VoiceTranscriptionToggle } from "@app/components/workspace/settings/VoiceTranscriptionToggle";
import type { WorkspaceType } from "@app/types";

export function CapabilitiesSection({
  owner,
  showRestrictAgentsPublishing,
}: {
  owner: WorkspaceType;
  showRestrictAgentsPublishing: boolean;
}) {
  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.H variant="h4">Capabilities</Page.H>
      <ContextItem.List>
        <div className="h-full border-b border-border dark:border-border-night" />
        <InteractiveContentSharingToggle owner={owner} />
        <VoiceTranscriptionToggle owner={owner} />
        {showRestrictAgentsPublishing && <RestrictAgentsPublishingCapability />}
      </ContextItem.List>
    </Page.Vertical>
  );
}
