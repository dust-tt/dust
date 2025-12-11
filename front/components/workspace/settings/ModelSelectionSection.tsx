import { Page } from "@dust-tt/sparkle";

import { ProviderManagementModal } from "@app/components/workspace/ProviderManagementModal";
import type { PlanType, WorkspaceType } from "@app/types";

export function ModelSelectionSection({
  owner,
  plan,
}: {
  owner: WorkspaceType;
  plan: PlanType;
}) {
  return (
    <Page.Vertical align="stretch" gap="md">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Page.H variant="h4">Model Selection</Page.H>
          <Page.P variant="secondary">
            Select the models you want available to your workspace.
          </Page.P>
        </div>
        <ProviderManagementModal owner={owner} plan={plan} />
      </div>
    </Page.Vertical>
  );
}
