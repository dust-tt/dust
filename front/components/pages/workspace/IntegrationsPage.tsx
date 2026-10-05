import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { ExtensionMcpToolsSection } from "@app/components/workspace/ExtensionMcpToolsSection";
import { DustMcpServerSettingsItem } from "@app/components/workspace/settings/DustMcpServerSettingsItem";
import { EmailAgentsToggle } from "@app/components/workspace/settings/EmailAgentsToggle";
import { MessagingAppToggles } from "@app/components/workspace/settings/MessagingAppToggles";
import { SlackPersonalFooterRemovalToggle } from "@app/components/workspace/settings/SlackPersonalFooterRemovalToggle";
import { useAdminPageTab } from "@app/hooks/useAdminPageTab";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import {
  CloudArrowLeftRight,
  Mail01,
  Page,
  PuzzlePiece01,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

const INTEGRATIONS_TABS = ["messaging", "email", "clients"] as const;
type IntegrationsTab = (typeof INTEGRATIONS_TABS)[number];

export function IntegrationsPage() {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { tab, setTab } = useAdminPageTab<IntegrationsTab>(
    INTEGRATIONS_TABS,
    "messaging"
  );

  return (
    <AdminPageContainer>
      <div className="flex flex-col gap-6">
        <Page.Header
          title={t`Integrations`}
          description={t`Connect Dust to the tools where your team already works.`}
        />
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as IntegrationsTab)}
        >
          <TabsList className="mb-6">
            <TabsTrigger value="messaging" label={t`Messaging`} />
            <TabsTrigger value="email" label={t`Email`} />
            <TabsTrigger value="clients" label={t`Clients`} />
          </TabsList>
          <TabsContent value="messaging" className="flex flex-col gap-8">
            <GovernanceSettingSection
              sectionId={ADMIN_SECTION_IDS.integrations.messaging}
              label={t`Messaging apps`}
              icon={CloudArrowLeftRight}
            >
              <MessagingAppToggles owner={owner} />
              <SlackPersonalFooterRemovalToggle owner={owner} />
            </GovernanceSettingSection>
          </TabsContent>
          <TabsContent value="email" className="flex flex-col gap-8">
            <GovernanceSettingSection
              sectionId={ADMIN_SECTION_IDS.integrations.email}
              label={t`Email`}
              icon={Mail01}
            >
              <EmailAgentsToggle owner={owner} />
            </GovernanceSettingSection>
          </TabsContent>
          <TabsContent value="clients" className="flex flex-col gap-8">
            <GovernanceSettingSection
              sectionId={ADMIN_SECTION_IDS.integrations.clients}
              label={t`Clients`}
              icon={PuzzlePiece01}
            >
              <DustMcpServerSettingsItem owner={owner} />
              <ExtensionMcpToolsSection owner={owner} />
            </GovernanceSettingSection>
          </TabsContent>
        </Tabs>
      </div>
    </AdminPageContainer>
  );
}
