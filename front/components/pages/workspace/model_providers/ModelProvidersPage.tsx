import { ModelProvidersPageContent } from "@app/components/pages/workspace/model_providers/ModelProvidersPageContent";
import { useProvidersSelection } from "@app/hooks/useProvidersSelection";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspace as useWorkspaceDetails } from "@app/lib/swr/workspaces";
import { BrainIcon, Page, Spinner } from "@dust-tt/sparkle";

export function ModelProvidersPage() {
  const owner = useWorkspace();
  const { workspace, isWorkspaceValidating, mutateWorkspace } =
    useWorkspaceDetails({ owner });
  const { providersSelection, toggleProvider, selectAllProviders } =
    useProvidersSelection(workspace, owner, mutateWorkspace);

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title="Model Providers"
        icon={BrainIcon}
        description="Choose which AI providers and models are available to your workspace."
      />
      <Page.Vertical align="stretch" gap="md">
        <ModelProvidersPageContent
          workspace={workspace}
          providersSelection={providersSelection}
          isWorkspaceValidating={isWorkspaceValidating}
          onToggleProvider={toggleProvider}
          onSelectAllProviders={selectAllProviders}
        />
      </Page.Vertical>
    </Page.Vertical>
  );
}
