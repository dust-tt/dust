import { ModelProvidersPageContent } from "@app/components/pages/workspace/model_providers/ModelProvidersPageContent";
import { useProvidersSelection } from "@app/hooks/useProvidersSelection";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspace as useWorkspaceDetails } from "@app/lib/swr/workspaces";
import { BrainIcon, Page } from "@dust-tt/sparkle";

export function ModelProvidersPage() {
  const owner = useWorkspace();
  const { workspace, isWorkspaceValidating, mutateWorkspace } =
    useWorkspaceDetails({ owner });
  const { providersSelection, toggleProvider, selectAllProviders } =
    useProvidersSelection(workspace, owner, mutateWorkspace);

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
            providersSelection={providersSelection}
            isWorkspaceValidating={isWorkspaceValidating}
            onToggleProvider={toggleProvider}
            onSelectAllProviders={selectAllProviders}
          />
        )}
      </Page.Vertical>
    </Page.Vertical>
  );
}
