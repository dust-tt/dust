import { PodSettingsAdvancedTab } from "@app/components/pod/settings/PodSettingsAdvancedTab";
import { PodSettingsCustomizationTab } from "@app/components/pod/settings/PodSettingsCustomizationTab";
import { PodSettingsGeneralTab } from "@app/components/pod/settings/PodSettingsGeneralTab";
import { PodSettingsParticipantsTab } from "@app/components/pod/settings/PodSettingsParticipantsTab";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ContentMessage,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";

const POD_SETTINGS_TABS = [
  { value: "general", label: "General" },
  { value: "customization", label: "Customization" },
  { value: "participants", label: "Participants" },
  { value: "advanced", label: "Advanced" },
];

interface PodSettingsSectionProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
  onOpenMembersPanel?: () => void;
}

export function PodSettingsSection({
  owner,
  pod,
  onOpenMembersPanel,
}: PodSettingsSectionProps) {
  const [activeTab, setActiveTab] = useState("general");
  const { hasFeature } = useFeatureFlags();

  // The advanced tab is only visible when the frames_v2 feature is enabled
  const visibleTabs = POD_SETTINGS_TABS.filter(
    (tab) => tab.value !== "advanced" || hasFeature("frames_v2")
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
        {pod.archivedAt && (
          <ContentMessage variant="info" size="lg">
            This Pod has been archived.
          </ContentMessage>
        )}

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex w-full flex-col gap-8"
        >
          <TabsList>
            {visibleTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                label={tab.label}
              />
            ))}
          </TabsList>

          <TabsContent value="general">
            <PodSettingsGeneralTab owner={owner} pod={pod} />
          </TabsContent>

          <TabsContent value="customization">
            <PodSettingsCustomizationTab owner={owner} pod={pod} />
          </TabsContent>

          <TabsContent value="participants">
            <PodSettingsParticipantsTab
              owner={owner}
              pod={pod}
              onOpenMembersPanel={onOpenMembersPanel}
            />
          </TabsContent>

          <TabsContent value="advanced">
            <PodSettingsAdvancedTab owner={owner} pod={pod} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
