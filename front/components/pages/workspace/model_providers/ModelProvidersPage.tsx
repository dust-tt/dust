import { AllProvidersToggle } from "@app/components/pages/workspace/model_providers/AllProvidersToggle";
import { useProvidersSelection } from "@app/hooks/useProvidersSelection";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspace as useWorkspaceDetails } from "@app/lib/swr/workspaces";
import { GlobeAltIcon, Page } from "@dust-tt/sparkle";

export function ModelProvidersPage() {
  const owner = useWorkspace();
  const { workspace } = useWorkspaceDetails({ owner });
  const { providersSelection, setProvidersSelection } =
    useProvidersSelection(workspace);

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title="Model Providers"
        icon={GlobeAltIcon}
        description="Configure model providers."
      />
      <Page.Vertical align="stretch" gap="md">
        <AllProvidersToggle
          providersSelection={providersSelection}
          setProvidersSelection={setProvidersSelection}
        />
      </Page.Vertical>
    </Page.Vertical>
  );
}
