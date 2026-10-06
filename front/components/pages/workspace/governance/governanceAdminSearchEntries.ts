import { getGovernancePermissionMetadata } from "@app/components/pages/workspace/governance/capabilityMetadata";
import {
  CONVERSATION_EXTERNAL_NOTIFICATIONS_LABEL,
  INACTIVE_AGENT_ARCHIVAL_LABEL,
  OPEN_PODS_LABEL,
  POD_KNOWLEDGE_LABEL,
  PRIVATE_CONVERSATION_URLS_LABEL,
  VOICE_TRANSCRIPTION_LABEL,
  WORKSPACE_ANALYTICS_LABEL,
  WORKSPACE_DEFAULT_AGENT_LABEL,
} from "@app/components/workspace/settings/settings_metadata";
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
  // Always mounted above the tabs (no `?tab=`).
  ...adminSearchEntries(PAGE, G.workspaceName, [
    ["Workspace Name", "rename workspace organization name"],
  ]),
  ...capabilityEntries(),
  ...adminSearchEntries(
    PAGE,
    S.settings,
    [
      [
        "Allow self-improving skills",
        "self improving skills reinforcement analyze conversations",
      ],
      [
        "Enable batch processing",
        "self improving skills zdr immediate data deletion batches",
      ],
    ],
    "agents"
  ),
  ...adminSearchEntries(
    PAGE,
    S.skills,
    [["Skills", "per skill editors enabled currently spent lock state"]],
    "agents"
  ),
  ...adminSearchEntries(
    PAGE,
    G.frame,
    [["Frame sharing", "shareable outside workspace restriction"]],
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
      ["Language", "locale localisation"],
      [VOICE_TRANSCRIPTION_LABEL, "dictation conversations"],
      [CONVERSATION_EXTERNAL_NOTIFICATIONS_LABEL, "conversation notifications"],
      [PRIVATE_CONVERSATION_URLS_LABEL, "conversation privacy participants"],
      [WORKSPACE_ANALYTICS_LABEL, "analyst agent analytics tools admins"],
      [INACTIVE_AGENT_ARCHIVAL_LABEL, "archive them once auto"],
      ["Inactivity threshold", "days unmentioned archived schedule excluded"],
    ],
    "features"
  ),
];
