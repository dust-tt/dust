import {
  ContentMessage,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";

import {
  DEFAULT_POD_AGENTS_MD,
  DEFAULT_POD_SKILL_IDS,
  MOCK_POD_EGRESS_DOMAINS,
  MOCK_POD_EGRESS_REQUESTS,
  MOCK_POD_ENV_VARS,
  MOCK_POD_GROUPS,
  type PodEnvVar,
  type PodGroup,
  type PodNotificationCondition,
} from "../data";
import type { Space } from "../data/types";
import { PodSettingsAdvancedTab } from "./PodSettingsAdvancedTab";
import { PodSettingsCustomizationTab } from "./PodSettingsCustomizationTab";
import { PodSettingsGeneralTab } from "./PodSettingsGeneralTab";
import { PodSettingsParticipantsTab } from "./PodSettingsParticipantsTab";
import type {
  PodSettingsMember,
  PodTabCustomization,
} from "./podSettingsShared";

const POD_SETTINGS_TABS = [
  { value: "general", label: "General" },
  { value: "customization", label: "Customization" },
  { value: "participants", label: "Participants" },
  { value: "advanced", label: "Advanced" },
];

export interface PodSettingsSectionProps {
  space: Space;
  members: PodSettingsMember[];
  editorUserIds?: string[];
  isPublic: boolean;
  notificationCondition: PodNotificationCondition;
  onUpdateSpaceName?: (spaceId: string, newName: string) => void;
  onUpdateSpacePublic?: (spaceId: string, isPublic: boolean) => void;
  onUpdateSpaceNotifications?: (
    spaceId: string,
    condition: PodNotificationCondition
  ) => void;
  onInviteMembers?: () => void;
  podTabCustomization?: PodTabCustomization;
}

export function PodSettingsSection({
  space,
  members,
  editorUserIds = [],
  isPublic: initialIsPublic,
  notificationCondition: initialNotificationCondition,
  onUpdateSpaceName,
  onUpdateSpacePublic,
  onUpdateSpaceNotifications,
  onInviteMembers,
  podTabCustomization,
}: PodSettingsSectionProps) {
  const [activeTab, setActiveTab] = useState("general");

  // Tab panels unmount when inactive, so everything a tab can change lives
  // here and survives switching tabs. In-progress drafts stay in the tabs.
  const [description, setDescription] = useState(space.description ?? "");
  const [notificationCondition, setNotificationCondition] =
    useState<PodNotificationCondition>(initialNotificationCondition);
  const [instructions, setInstructions] = useState(DEFAULT_POD_AGENTS_MD);
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
  const [defaultSkillIds, setDefaultSkillIds] = useState<string[]>(
    DEFAULT_POD_SKILL_IDS
  );
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [editorIds, setEditorIds] = useState<string[]>(editorUserIds);
  const [groups, setGroups] = useState<PodGroup[]>(MOCK_POD_GROUPS);
  const [allowedDomains, setAllowedDomains] = useState<string[]>(
    MOCK_POD_EGRESS_DOMAINS
  );
  const [requestedDomains, setRequestedDomains] = useState<string[]>(
    MOCK_POD_EGRESS_REQUESTS
  );
  const [envVars, setEnvVars] = useState<PodEnvVar[]>(MOCK_POD_ENV_VARS);
  const [archivedAt, setArchivedAt] = useState<Date | null>(null);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
        {archivedAt && (
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
            {POD_SETTINGS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                label={tab.label}
              />
            ))}
          </TabsList>

          <TabsContent value="general">
            <PodSettingsGeneralTab
              space={space}
              description={description}
              onDescriptionChange={setDescription}
              notificationCondition={notificationCondition}
              onNotificationConditionChange={(condition) => {
                setNotificationCondition(condition);
                onUpdateSpaceNotifications?.(space.id, condition);
              }}
              archivedAt={archivedAt}
              onArchivedAtChange={setArchivedAt}
              onUpdateSpaceName={onUpdateSpaceName}
            />
          </TabsContent>

          <TabsContent value="customization">
            <PodSettingsCustomizationTab
              instructions={instructions}
              onInstructionsChange={setInstructions}
              defaultAgentId={defaultAgentId}
              onDefaultAgentIdChange={setDefaultAgentId}
              defaultSkillIds={defaultSkillIds}
              onDefaultSkillIdsChange={setDefaultSkillIds}
              podTabCustomization={podTabCustomization}
            />
          </TabsContent>

          <TabsContent value="participants">
            <PodSettingsParticipantsTab
              space={space}
              members={members}
              isPublic={isPublic}
              onIsPublicChange={setIsPublic}
              editorIds={editorIds}
              onEditorIdsChange={setEditorIds}
              groups={groups}
              onGroupsChange={setGroups}
              onUpdateSpacePublic={onUpdateSpacePublic}
              onInviteMembers={onInviteMembers}
            />
          </TabsContent>

          <TabsContent value="advanced">
            <PodSettingsAdvancedTab
              allowedDomains={allowedDomains}
              onAllowedDomainsChange={setAllowedDomains}
              requestedDomains={requestedDomains}
              onRequestedDomainsChange={setRequestedDomains}
              envVars={envVars}
              onEnvVarsChange={setEnvVars}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
