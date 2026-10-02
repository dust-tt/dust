import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { ModelProvidersPageContent } from "@app/components/pages/workspace/model_providers/ModelProvidersPageContent";
import { useProvidersSelection } from "@app/hooks/useProvidersSelection";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspace as useWorkspaceDetails } from "@app/lib/swr/workspaces";
import { Page, Spinner } from "@dust-tt/sparkle";

export function ModelProvidersPage() {
  const owner = useWorkspace();
  const { workspace, isWorkspaceValidating, mutateWorkspace } =
    useWorkspaceDetails({ owner });
  const { providersSelection, toggleProvider, selectAllProviders } =
    useProvidersSelection(workspace, owner, mutateWorkspace);

  if (!workspace) {
    return (
      <AdminPageContainer>
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer>
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header
          title="Model Providers"
          description="Choose which AI providers and models are available to your workspace."
        />
        <AdminSectionAnchor
          sectionId={ADMIN_SECTION_IDS.modelProviders.providers}
        >
          <Page.Vertical align="stretch" gap="md">
            <ModelProvidersPageContent
              workspace={workspace}
              providersSelection={providersSelection}
              isWorkspaceValidating={isWorkspaceValidating}
              onToggleProvider={toggleProvider}
              onSelectAllProviders={selectAllProviders}
            />
          </Page.Vertical>
        </AdminSectionAnchor>
      </Page.Vertical>
    </AdminPageContainer>
  );
}
