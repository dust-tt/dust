import { getGovernancePermissionMetadata } from "@app/components/pages/workspace/governance/capabilityMetadata";
import { CONVERSATION_EXTERNAL_NOTIFICATIONS_LABEL } from "@app/components/workspace/settings/ConversationExternalNotificationsToggle";
import {
  INACTIVE_AGENT_ARCHIVAL_LABEL,
  INACTIVITY_THRESHOLD_LABEL,
} from "@app/components/workspace/settings/InactiveAgentArchival";
import { FRAME_SHARING_LABEL } from "@app/components/workspace/settings/InteractiveContentSharingToggle";
import { OPEN_PODS_LABEL } from "@app/components/workspace/settings/OpenPodsPolicy";
import { POD_KNOWLEDGE_LABEL } from "@app/components/workspace/settings/PodKnowledgePolicy";
import { PRIVATE_CONVERSATION_URLS_LABEL } from "@app/components/workspace/settings/PrivateConversationUrlsToggle";
import {
  ALLOW_SELF_IMPROVING_SKILLS_LABEL,
  ENABLE_BATCH_PROCESSING_LABEL,
  SELF_IMPROVING_SKILLS_LIST_SECTION_LABEL,
} from "@app/components/workspace/settings/SelfImprovingSkillsSettingsSection";
import { VOICE_TRANSCRIPTION_LABEL } from "@app/components/workspace/settings/VoiceTranscriptionToggle";
import { WORKSPACE_ANALYTICS_LABEL } from "@app/components/workspace/settings/WorkspaceAnalyticsToggle";
import { WORKSPACE_DEFAULT_AGENT_LABEL } from "@app/components/workspace/settings/WorkspaceDefaultAgentPicker";
import { WORKSPACE_LOCALE_LABEL } from "@app/components/workspace/settings/WorkspaceLocalePicker";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { GOVERNANCE_CAPABILITIES } from "@app/types/group_permissions";

const G = ADMIN_SECTION_IDS.governance;
const S = ADMIN_SECTION_IDS.selfImprovingSkills;
const PAGE = "governance" as const;

const CAPABILITY_SECTION: Record<
  Exclude<keyof typeof GOVERNANCE_CAPABILITIES, "billingAndSecurity">,
  { sectionId: AdminSectionId; tab: string }
> = {
  agent: { sectionId: G.agents, tab: "agents" },
  skill: { sectionId: G.skills, tab: "agents" },
  frame: { sectionId: G.frame, tab: "pods" },
  trigger: { sectionId: G.automations, tab: "pods" },
};

function capabilityEntries(): AdminSettingEntry[] {
  const byKey = new Map<
    string,
    { sectionId: AdminSectionId; tab: string; items: [string, string][] }
  >();
  for (const [group, capabilities] of Object.entries(GOVERNANCE_CAPABILITIES)) {
    if (group === "billingAndSecurity") {
      // Roles / billing-security permissions live under Members › Roles.
      continue;
    }
    const target = CAPABILITY_SECTION[group as keyof typeof CAPABILITY_SECTION];
    if (!target) {
      continue;
    }
    const key = `${target.sectionId}/${target.tab}`;
    const bucket = byKey.get(key) ?? {
      sectionId: target.sectionId,
      tab: target.tab,
      items: [],
    };
    for (const capability of capabilities) {
      const metadata = getGovernancePermissionMetadata(capability);
      if (!metadata) {
        continue;
      }
      bucket.items.push([metadata.label, metadata.searchKeywords ?? ""]);
    }
    byKey.set(key, bucket);
  }
  return [...byKey.values()].flatMap(({ sectionId, tab, items }) =>
    adminSearchEntries(PAGE, sectionId, items, tab)
  );
}

/**
 * Search entries for Governance. Messaging / email / MCP / extension tools
 * live under Integrations; roles under Members; audit emit under Security.
 */
export const GOVERNANCE_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...capabilityEntries(),
  ...adminSearchEntries(
    PAGE,
    S.settings,
    [
      [
        ALLOW_SELF_IMPROVING_SKILLS_LABEL,
        "self improving skills reinforcement analyze conversations",
      ],
      [
        ENABLE_BATCH_PROCESSING_LABEL,
        "self improving skills zdr immediate data deletion batches",
      ],
    ],
    "agents"
  ),
  ...adminSearchEntries(
    PAGE,
    S.skills,
    [
      [
        SELF_IMPROVING_SKILLS_LIST_SECTION_LABEL,
        "per skill editors enabled currently spent lock state",
      ],
    ],
    "agents"
  ),
  ...adminSearchEntries(
    PAGE,
    G.frame,
    [[FRAME_SHARING_LABEL, "shareable outside workspace restriction"]],
    "pods"
  ),
  ...adminSearchEntries(
    PAGE,
    G.pods,
    [
      [OPEN_PODS_LABEL, "members create open pods"],
      [POD_KNOWLEDGE_LABEL, "manually add files to pods manual updates"],
    ],
    "pods"
  ),
  ...adminSearchEntries(
    PAGE,
    G.features,
    [
      [WORKSPACE_DEFAULT_AGENT_LABEL, "workspace default agent picker"],
      [WORKSPACE_LOCALE_LABEL, "locale localisation"],
      [VOICE_TRANSCRIPTION_LABEL, "dictation conversations"],
      [CONVERSATION_EXTERNAL_NOTIFICATIONS_LABEL, "conversation notifications"],
      [PRIVATE_CONVERSATION_URLS_LABEL, "conversation privacy participants"],
      [WORKSPACE_ANALYTICS_LABEL, "analyst agent analytics tools admins"],
      [INACTIVE_AGENT_ARCHIVAL_LABEL, "archive them once auto"],
      [
        INACTIVITY_THRESHOLD_LABEL,
        "days unmentioned archived schedule excluded",
      ],
    ],
    "features"
  ),
];
