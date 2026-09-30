import { displayRoleCapitalized } from "@app/components/members/Roles";
import { getGovernancePermissionMetadata } from "@app/components/pages/workspace/governance/capabilityMetadata";
import { EXTENSION_MCP_TOOLS_LABEL } from "@app/components/workspace/ExtensionMcpToolsSection";
import { AUDIT_LOGS_EMIT_LABEL } from "@app/components/workspace/settings/AuditLogsToggle";
import { CONVERSATION_EXTERNAL_NOTIFICATIONS_LABEL } from "@app/components/workspace/settings/ConversationExternalNotificationsToggle";
import { DUST_MCP_SERVER_LABEL } from "@app/components/workspace/settings/DustMcpServerSettingsItem";
import { EMAIL_AGENTS_LABEL } from "@app/components/workspace/settings/EmailAgentsToggle";
import {
  INACTIVE_AGENT_ARCHIVAL_LABEL,
  INACTIVITY_THRESHOLD_LABEL,
} from "@app/components/workspace/settings/InactiveAgentArchival";
import { FRAME_SHARING_LABEL } from "@app/components/workspace/settings/InteractiveContentSharingToggle";
import { MESSAGING_APP_METADATA } from "@app/components/workspace/settings/MessagingAppToggles";
import { OPEN_PODS_LABEL } from "@app/components/workspace/settings/OpenPodsPolicy";
import { POD_KNOWLEDGE_LABEL } from "@app/components/workspace/settings/PodKnowledgePolicy";
import { PRIVATE_CONVERSATION_URLS_LABEL } from "@app/components/workspace/settings/PrivateConversationUrlsToggle";
import { SLACK_PERSONAL_FOOTER_REMOVAL_LABEL } from "@app/components/workspace/settings/SlackPersonalFooterRemovalToggle";
import { VOICE_TRANSCRIPTION_LABEL } from "@app/components/workspace/settings/VoiceTranscriptionToggle";
import { WORKSPACE_ANALYTICS_LABEL } from "@app/components/workspace/settings/WorkspaceAnalyticsToggle";
import { WORKSPACE_DEFAULT_AGENT_LABEL } from "@app/components/workspace/settings/WorkspaceDefaultAgentPicker";
import { WORKSPACE_LOCALE_LABEL } from "@app/components/workspace/settings/WorkspaceLocalePicker";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { GOVERNANCE_CAPABILITIES } from "@app/types/group_permissions";
import { GROUP_GRANTABLE_ROLES } from "@app/types/groups";

const G = ADMIN_SECTION_IDS.governance;
const PAGE = "governance" as const;

const CAPABILITY_SECTION: Record<
  keyof typeof GOVERNANCE_CAPABILITIES,
  AdminSectionId
> = {
  agent: G.agents,
  skill: G.skills,
  frame: G.frame,
  billingAndSecurity: G.billing,
  trigger: G.automations,
};

function capabilityEntries(): AdminSettingEntry[] {
  const bySection = new Map<AdminSectionId, [string, string][]>();
  for (const [group, capabilities] of Object.entries(GOVERNANCE_CAPABILITIES)) {
    const sectionId =
      CAPABILITY_SECTION[group as keyof typeof CAPABILITY_SECTION];
    for (const capability of capabilities) {
      const metadata = getGovernancePermissionMetadata(capability);
      if (!metadata) {
        continue;
      }
      const items = bySection.get(sectionId) ?? [];
      items.push([metadata.label, metadata.searchKeywords ?? ""]);
      bySection.set(sectionId, items);
    }
  }
  return [...bySection.entries()].flatMap(([sectionId, items]) =>
    adminSearchEntries(PAGE, sectionId, items)
  );
}

/**
 * Search entries for Settings & Governance. Labels come from the same UI
 * constants / metadata the page renders; keep this next to GovernancePage when
 * moving a setting between sections.
 */
export const GOVERNANCE_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...capabilityEntries(),
  ...adminSearchEntries(PAGE, G.frame, [
    [FRAME_SHARING_LABEL, "shareable outside workspace restriction"],
  ]),
  ...adminSearchEntries(
    PAGE,
    G.roles,
    GROUP_GRANTABLE_ROLES.map((role) => [
      displayRoleCapitalized(role),
      role === "admin"
        ? "full administrative control role groups"
        : "members groups roles analytics",
    ])
  ),
  ...adminSearchEntries(PAGE, G.pods, [
    [OPEN_PODS_LABEL, "members create open pods"],
    [POD_KNOWLEDGE_LABEL, "manually add files to pods manual updates"],
  ]),
  ...adminSearchEntries(PAGE, G.features, [
    [WORKSPACE_DEFAULT_AGENT_LABEL, "workspace default agent picker"],
    [WORKSPACE_LOCALE_LABEL, "locale localisation"],
    [VOICE_TRANSCRIPTION_LABEL, "dictation conversations"],
    [EMAIL_AGENTS_LABEL, "reach agents by email"],
    [CONVERSATION_EXTERNAL_NOTIFICATIONS_LABEL, "conversation notifications"],
    [PRIVATE_CONVERSATION_URLS_LABEL, "conversation privacy participants"],
    [DUST_MCP_SERVER_LABEL, "external mcp clients connect manage"],
    [EXTENSION_MCP_TOOLS_LABEL, "list read browser tabs extension"],
    [SLACK_PERSONAL_FOOTER_REMOVAL_LABEL, "remove footer user credentials"],
    [WORKSPACE_ANALYTICS_LABEL, "analyst agent analytics tools admins"],
    [INACTIVE_AGENT_ARCHIVAL_LABEL, "archive them once auto"],
    [INACTIVITY_THRESHOLD_LABEL, "days unmentioned archived schedule excluded"],
  ]),
  ...adminSearchEntries(
    PAGE,
    G.messaging,
    Object.values(MESSAGING_APP_METADATA).map((app) => {
      const keywords =
        app.name === "Slack Bot"
          ? "slack reconnect"
          : app.name === "Microsoft Teams Bot"
            ? "teams"
            : "discord reconnect";
      return [app.name, keywords] as [string, string];
    })
  ),
  ...adminSearchEntries(PAGE, G.audit, [
    [AUDIT_LOGS_EMIT_LABEL, "emit audit events workos"],
  ]),
];
