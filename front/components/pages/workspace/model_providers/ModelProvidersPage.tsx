import { AllProvidersToggle } from "@app/components/pages/workspace/model_providers/AllProvidersToggle";
import { EmbeddingModelSelect } from "@app/components/pages/workspace/model_providers/EmbeddingModelSelect";
import { ProvidersList } from "@app/components/pages/workspace/model_providers/ProvidersList";
import { useProvidersSelection } from "@app/hooks/useProvidersSelection";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspace as useWorkspaceDetails } from "@app/lib/swr/workspaces";
import { BrainIcon, Page } from "@dust-tt/sparkle";

export function ModelProvidersPage() {
  const owner = useWorkspace();
  const { workspace, isWorkspaceLoading, isWorkspaceValidating } =
    useWorkspaceDetails({ owner });
  const { providersSelection, setProvidersSelection } =
    useProvidersSelection(workspace);

  const isWorkspacePending = isWorkspaceLoading || isWorkspaceValidating;

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title="Model Providers"
        icon={BrainIcon}
        description="Configure model providers."
      />
      <Page.Vertical align="stretch" gap="md">
        <div className="flex flex-col gap-8">
          <AllProvidersToggle
            providersSelection={providersSelection}
            setProvidersSelection={setProvidersSelection}
          />
          <ProvidersList
            providersSelection={providersSelection}
            setProvidersSelection={setProvidersSelection}
            isWorkspacePending={isWorkspacePending}
          />
          <EmbeddingModelSelect workspace={workspace} />
        </div>
      </Page.Vertical>
    </Page.Vertical>
  );
}
