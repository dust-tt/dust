import { MessagingAppToggles } from "@app/components/workspace/settings/MessagingAppToggles";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, Page } from "@dust-tt/sparkle";

interface IntegrationsSectionProps {
  owner: WorkspaceType;
}

export function IntegrationsSection({ owner }: IntegrationsSectionProps) {
  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.H variant="h4">Integrations</Page.H>
      <ContextItem.List>
        <div className="h-full border-b border-border" />
        <MessagingAppToggles owner={owner} />
      </ContextItem.List>
    </Page.Vertical>
  );
}
