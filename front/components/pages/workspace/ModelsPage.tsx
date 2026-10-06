import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { Providers } from "@app/components/pages/workspace/developers/ProvidersPage";
import { ModelProvidersPageContent } from "@app/components/pages/workspace/model_providers/ModelProvidersPageContent";
import { ModelTiersSettingsCard } from "@app/components/workspace/usage/ModelTiersSettingsCard";
import { useAdminPageTab } from "@app/hooks/useAdminPageTab";
import { useProvidersSelection } from "@app/hooks/useProvidersSelection";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspace as useWorkspaceDetails } from "@app/lib/swr/workspaces";
import {
  Page,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

const MODELS_TABS = ["providers", "tiers", "apps"] as const;
type ModelsTab = (typeof MODELS_TABS)[number];

export function ModelsPage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const showApps = hasFeature("legacy_dust_apps");
  const { workspace, isWorkspaceValidating, mutateWorkspace } =
    useWorkspaceDetails({ owner });
  const { providersSelection, toggleProvider, selectAllProviders } =
    useProvidersSelection(workspace, owner, mutateWorkspace);

  const { tab, setTab } = useAdminPageTab<ModelsTab>(MODELS_TABS, "providers");
  const activeTab: ModelsTab = tab === "apps" && !showApps ? "providers" : tab;

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
        <Page.Header title={t`Models`} />
        <Tabs
          value={activeTab}
          onValueChange={(value) => setTab(value as ModelsTab)}
        >
          <TabsList className="mb-6">
            <TabsTrigger value="providers" label={t`Providers`} />
            <TabsTrigger value="tiers" label={t`Access tiers`} />
            {showApps && (
              <TabsTrigger value="apps" label={t`App Credentials`} />
            )}
          </TabsList>
          <TabsContent value="providers" className="flex flex-col gap-4">
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
          </TabsContent>
          <TabsContent value="tiers" className="flex flex-col gap-4">
            <AdminSectionAnchor
              sectionId={ADMIN_SECTION_IDS.modelProviders.tiers}
            >
              <ModelTiersSettingsCard owner={owner} />
            </AdminSectionAnchor>
          </TabsContent>
          {showApps && (
            <TabsContent value="apps" className="flex flex-col gap-4">
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.modelProviders.apps}
              >
                <Providers owner={owner} />
              </AdminSectionAnchor>
            </TabsContent>
          )}
        </Tabs>
      </Page.Vertical>
    </AdminPageContainer>
  );
}
