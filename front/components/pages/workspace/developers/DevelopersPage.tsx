import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { APIKeysPageContent } from "@app/components/pages/workspace/developers/APIKeysPage";
import { API_KEYS_PAGE_TITLE } from "@app/components/pages/workspace/developers/apiKeysAdminSearchEntries";
import { SecretsPageContent } from "@app/components/pages/workspace/developers/SecretsPage";
import { EnvironmentSection } from "@app/components/pages/workspace/developers/sections/EnvironmentSection";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import { useAdminPageTab } from "@app/hooks/useAdminPageTab";
import { useComputerAdminAccess } from "@app/hooks/useComputerAdminAccess";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import {
  Page,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";

const DEVELOPERS_TABS = ["keys", "secrets", "env"] as const;
type DevelopersTab = (typeof DEVELOPERS_TABS)[number];

export function DevelopersPage() {
  const owner = useWorkspace();
  const { isComputerEnabled } = useComputerAdminAccess();
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );

  const { tab, setTab } = useAdminPageTab<DevelopersTab>(
    DEVELOPERS_TABS,
    "keys"
  );
  const activeTab: DevelopersTab =
    tab === "env" && !isComputerEnabled ? "keys" : tab;

  return (
    <AdminPageContainer>
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header title="Developers" />
        <Tabs
          value={activeTab}
          onValueChange={(value) => setTab(value as DevelopersTab)}
        >
          <TabsList className="mb-6">
            <TabsTrigger value="keys" label="API keys" />
            <TabsTrigger value="secrets" label="Secrets" />
            {isComputerEnabled && (
              <TabsTrigger value="env" label="Computer environment" />
            )}
          </TabsList>
          <TabsContent value="keys" className="flex flex-col gap-4">
            <div className="flex w-full items-center justify-between gap-4">
              <Page.H variant="h4">{API_KEYS_PAGE_TITLE}</Page.H>
              <ConsumptionPeriodSelector
                period={period}
                onPeriodChange={setPeriod}
              />
            </div>
            <APIKeysPageContent owner={owner} period={period} />
          </TabsContent>
          <TabsContent value="secrets" className="flex flex-col gap-4">
            <SecretsPageContent />
          </TabsContent>
          {isComputerEnabled && (
            <TabsContent value="env" className="flex flex-col gap-4">
              <AdminSectionAnchor
                sectionId={ADMIN_SECTION_IDS.computer.environment}
              >
                <EnvironmentSection />
              </AdminSectionAnchor>
            </TabsContent>
          )}
        </Tabs>
      </Page.Vertical>
    </AdminPageContainer>
  );
}
