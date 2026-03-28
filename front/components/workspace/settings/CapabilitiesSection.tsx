import { EmailAgentsToggle } from "@app/components/workspace/settings/EmailAgentsToggle";
import { InteractiveContentSharingToggle } from "@app/components/workspace/settings/InteractiveContentSharingToggle";
import { RestrictAgentsPublishingCapability } from "@app/components/workspace/settings/RestrictAgentsPublishingCapability";
import { VoiceTranscriptionToggle } from "@app/components/workspace/settings/VoiceTranscriptionToggle";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, Page } from "@dust-tt/sparkle";

interface CapabilitiesSectionProps {
  owner: WorkspaceType;
  publishingRestrictionMessage: string | null;
  isEmailAgentsAvailable: boolean;
}

export function CapabilitiesSection({
  owner,
  publishingRestrictionMessage,
  isEmailAgentsAvailable,
}: CapabilitiesSectionProps) {
  const { subscription } = useAuth();

  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.H variant="h4">Capabilities</Page.H>
      <ContextItem.List>
        <div className="h-full border-b border-border dark:border-border-night" />
        <InteractiveContentSharingToggle owner={owner} />
        {!subscription.plan.isByok && (
          <VoiceTranscriptionToggle owner={owner} />
        )}
        {isEmailAgentsAvailable && <EmailAgentsToggle owner={owner} />}
        {publishingRestrictionMessage && (
          <RestrictAgentsPublishingCapability
            subElement={publishingRestrictionMessage}
          />
        )}
      </ContextItem.List>
    </Page.Vertical>
  );
}
