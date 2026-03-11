import { ModelProvidersPageContent } from "@app/components/pages/workspace/model_providers/ModelProvidersPageContent";
import { useProvidersSelection } from "@app/hooks/useProvidersSelection";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspace as useWorkspaceDetails } from "@app/lib/swr/workspaces";
import { BrainIcon, Page } from "@dust-tt/sparkle";

export function ModelProvidersPage() {
  const owner = useWorkspace();
  const { workspace, isWorkspaceValidating } = useWorkspaceDetails({ owner });
  const { providersSelection, setProvidersSelection } =
    useProvidersSelection(workspace);

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title="Model Providers"
        icon={BrainIcon}
        description="Configure model providers."
      />
      <Page.Vertical align="stretch" gap="md">
        {workspace && (
          <ModelProvidersPageContent
            workspace={workspace}
            setProvidersSelection={setProvidersSelection}
            providersSelection={providersSelection}
            isWorkspaceValidating={isWorkspaceValidating}
          />
        )}
      </Page.Vertical>
    </Page.Vertical>
  );
}
