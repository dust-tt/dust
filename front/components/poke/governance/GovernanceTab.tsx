import { getGovernancePermissionMetadata } from "@app/components/pages/workspace/governance/capabilityMetadata";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableHead,
  PokeTableHeader,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import {
  EXTENSION_MCP_TOOLS_DESCRIPTION,
  EXTENSION_MCP_TOOLS_LABEL,
} from "@app/components/workspace/ExtensionMcpToolsSection";
import {
  CONVERSATION_EXTERNAL_NOTIFICATIONS_DESCRIPTION,
  CONVERSATION_EXTERNAL_NOTIFICATIONS_LABEL,
} from "@app/components/workspace/settings/ConversationExternalNotificationsToggle";
import {
  DUST_MCP_SERVER_DESCRIPTION,
  DUST_MCP_SERVER_LABEL,
} from "@app/components/workspace/settings/DustMcpServerSettingsItem";
import {
  EMAIL_AGENTS_DESCRIPTION,
  EMAIL_AGENTS_LABEL,
} from "@app/components/workspace/settings/EmailAgentsToggle";
import {
  INACTIVE_AGENT_ARCHIVAL_DESCRIPTION,
  INACTIVE_AGENT_ARCHIVAL_LABEL,
} from "@app/components/workspace/settings/InactiveAgentArchival";
import { MESSAGING_APP_METADATA } from "@app/components/workspace/settings/MessagingAppToggles";
import {
  OPEN_PODS_DESCRIPTION,
  OPEN_PODS_LABEL,
  OPEN_PODS_POLICIES,
} from "@app/components/workspace/settings/OpenPodsPolicy";
import {
  POD_KNOWLEDGE_DESCRIPTION,
  POD_KNOWLEDGE_LABEL,
  POD_KNOWLEDGE_POLICIES,
} from "@app/components/workspace/settings/PodKnowledgePolicy";
import {
  PRIVATE_CONVERSATION_URLS_DESCRIPTION,
  PRIVATE_CONVERSATION_URLS_LABEL,
} from "@app/components/workspace/settings/PrivateConversationUrlsToggle";
import {
  SLACK_PERSONAL_FOOTER_REMOVAL_DESCRIPTION,
  SLACK_PERSONAL_FOOTER_REMOVAL_LABEL,
} from "@app/components/workspace/settings/SlackPersonalFooterRemovalToggle";
import {
  VOICE_TRANSCRIPTION_DESCRIPTION,
  VOICE_TRANSCRIPTION_LABEL,
} from "@app/components/workspace/settings/VoiceTranscriptionToggle";
import {
  WORKSPACE_ANALYTICS_DESCRIPTION,
  WORKSPACE_ANALYTICS_LABEL,
} from "@app/components/workspace/settings/WorkspaceAnalyticsToggle";
import {
  WORKSPACE_DEFAULT_AGENT_DESCRIPTION,
  WORKSPACE_DEFAULT_AGENT_LABEL,
} from "@app/components/workspace/settings/WorkspaceDefaultAgentPicker";
import { isDustMcpServerEnabled } from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import type { PokeMessagingApp } from "@app/lib/api/poke/messaging_apps";
import {
  areEmailAgentsAllowed,
  areExtensionMcpToolsAllowed,
  areOpenPodsAllowed,
  arePrivateConversationUrlsDefault,
  isManualPodFilesManagementAllowed,
  isSlackPersonalFooterRemovalAllowed,
  isVoiceTranscriptionAllowed,
} from "@app/lib/workspace_policies";
import { usePokeGovernancePermissions } from "@app/poke/swr/governance_permissions";
import { usePokeGroups } from "@app/poke/swr/groups";
import { usePokeMessagingApps } from "@app/poke/swr/messaging_apps";
import type { GovernancePermissionsByKey } from "@app/types/api/governance";
import type {
  CapabilitySpec,
  PermissionConfigurationScope,
} from "@app/types/group_permissions";
import {
  capabilityKey,
  GOVERNANCE_CAPABILITIES,
} from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import {
  areConversationExternalNotificationsEnabled,
  getInactiveAgentArchivalThresholdDays,
  getWorkspaceDefaultAgentId,
  isWorkspaceAnalyticsEnabled,
} from "@app/types/user";
import { Chip, LinkWrapper, SliderToggle, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

// One line of the read-only governance view: the setting, its current value, and the groups it is
// restricted to (permission settings only).
interface GovernanceRow {
  key: string;
  label: string;
  description: string;
  value: ReactNode;
  groupIds: string[];
}

interface GovernanceSection {
  label: string;
  rows: GovernanceRow[];
  // Only permission sections can be restricted to groups; the others are plain workspace settings.
  showGroups: boolean;
}

function scopeChip(scope: PermissionConfigurationScope): ReactNode {
  switch (scope) {
    case "everyone":
      return <Chip color="warning">Everyone</Chip>;
    case "groups":
      return <Chip color="highlight">Groups</Chip>;
    case "admins_only":
      return <Chip color="success">Admins only</Chip>;
    default:
      assertNeverAndIgnore(scope);
      return <Chip color="info">{scope}</Chip>;
  }
}

// The Pods policies are dropdowns in the workspace settings: show the label of the selected option.
function policyLabel<T extends { label: string }>(
  policies: readonly T[],
  isSelected: (policy: T) => boolean
): string {
  return policies.find(isSelected)?.label ?? "Unknown";
}

// Boolean settings are rendered with the same toggle as the workspace Settings & Governance page.
// `pointer-events-none` makes it inert without the `disabled` styling, which mutes the track color
// so much that on/off becomes hard to tell apart.
function booleanToggle(isEnabled: boolean): ReactNode {
  return (
    <div className="pointer-events-none w-fit">
      <SliderToggle selected={isEnabled} />
    </div>
  );
}

// Permission sections, in the same order and grouping as the workspace Settings & Governance page.
const PERMISSION_SECTIONS: { label: string; capabilities: CapabilitySpec[] }[] =
  [
    { label: "Agents", capabilities: GOVERNANCE_CAPABILITIES.agent },
    { label: "Skills", capabilities: GOVERNANCE_CAPABILITIES.skill },
    { label: "Automations", capabilities: GOVERNANCE_CAPABILITIES.trigger },
    { label: "Frames", capabilities: GOVERNANCE_CAPABILITIES.frame },
    {
      label: "Billing and security",
      capabilities: GOVERNANCE_CAPABILITIES.billingAndSecurity,
    },
  ];

function buildPermissionRows(
  capabilities: CapabilitySpec[],
  governancePermissions: GovernancePermissionsByKey
): GovernanceRow[] {
  const permissions = removeNulls(
    capabilities.map(
      (capability) => governancePermissions[capabilityKey(capability)]
    )
  );

  return permissions.map((permission) => {
    const metadata = getGovernancePermissionMetadata(permission);
    const key = capabilityKey(permission);

    return {
      key,
      label: metadata?.label ?? key,
      description: metadata?.description ?? "",
      value: scopeChip(permission.configuration.scope),
      groupIds:
        permission.configuration.scope === "groups"
          ? permission.configuration.groupIds
          : [],
    };
  });
}

// Pods and Features are plain workspace settings (no groups): their state lives in the workspace
// metadata, read here through the same helpers the Settings & Governance page uses.
function buildPodRows(owner: LightWorkspaceType): GovernanceRow[] {
  return [
    {
      key: "allowOpenProjects",
      label: OPEN_PODS_LABEL,
      description: OPEN_PODS_DESCRIPTION,
      value: (
        <Chip color="info">
          {policyLabel(
            OPEN_PODS_POLICIES,
            (policy) => policy.allowOpenProjects === areOpenPodsAllowed(owner)
          )}
        </Chip>
      ),
      groupIds: [],
    },
    {
      key: "allowManualProjectKnowledgeManagement",
      label: POD_KNOWLEDGE_LABEL,
      description: POD_KNOWLEDGE_DESCRIPTION,
      value: (
        <Chip color="info">
          {policyLabel(
            POD_KNOWLEDGE_POLICIES,
            (policy) =>
              policy.allowManualProjectKnowledgeManagement ===
              isManualPodFilesManagementAllowed(owner)
          )}
        </Chip>
      ),
      groupIds: [],
    },
  ];
}

function buildFeatureRows(owner: LightWorkspaceType): GovernanceRow[] {
  const workspaceDefaultAgentId = getWorkspaceDefaultAgentId(owner);
  const inactiveAgentArchivalThresholdDays =
    getInactiveAgentArchivalThresholdDays(owner);
  return [
    {
      key: "workspaceDefaultAgentId",
      label: WORKSPACE_DEFAULT_AGENT_LABEL,
      description: WORKSPACE_DEFAULT_AGENT_DESCRIPTION,
      value: workspaceDefaultAgentId ? (
        <LinkWrapper
          href={`/poke/${owner.sId}/assistants/${workspaceDefaultAgentId}`}
        >
          <Chip color="info">{workspaceDefaultAgentId}</Chip>
        </LinkWrapper>
      ) : (
        <Chip color="info">None</Chip>
      ),
      groupIds: [],
    },
    {
      key: "allowVoiceTranscription",
      label: VOICE_TRANSCRIPTION_LABEL,
      description: VOICE_TRANSCRIPTION_DESCRIPTION,
      value: booleanToggle(isVoiceTranscriptionAllowed(owner)),
      groupIds: [],
    },
    {
      key: "allowEmailAgents",
      label: EMAIL_AGENTS_LABEL,
      description: EMAIL_AGENTS_DESCRIPTION,
      value: booleanToggle(areEmailAgentsAllowed(owner)),
      groupIds: [],
    },
    {
      key: "allowConversationExternalNotifications",
      label: CONVERSATION_EXTERNAL_NOTIFICATIONS_LABEL,
      description: CONVERSATION_EXTERNAL_NOTIFICATIONS_DESCRIPTION,
      value: booleanToggle(areConversationExternalNotificationsEnabled(owner)),
      groupIds: [],
    },
    {
      key: "privateConversationUrlsByDefault",
      label: PRIVATE_CONVERSATION_URLS_LABEL,
      description: PRIVATE_CONVERSATION_URLS_DESCRIPTION,
      value: booleanToggle(arePrivateConversationUrlsDefault(owner)),
      groupIds: [],
    },
    {
      key: "dustMcpServer",
      label: DUST_MCP_SERVER_LABEL,
      description: DUST_MCP_SERVER_DESCRIPTION,
      value: booleanToggle(isDustMcpServerEnabled(owner.metadata)),
      groupIds: [],
    },
    {
      key: "disableExtensionMcpTools",
      label: EXTENSION_MCP_TOOLS_LABEL,
      description: EXTENSION_MCP_TOOLS_DESCRIPTION,
      value: booleanToggle(areExtensionMcpToolsAllowed(owner)),
      groupIds: [],
    },
    {
      key: "slackPersonalAllowFooterRemoval",
      label: SLACK_PERSONAL_FOOTER_REMOVAL_LABEL,
      description: SLACK_PERSONAL_FOOTER_REMOVAL_DESCRIPTION,
      value: booleanToggle(isSlackPersonalFooterRemovalAllowed(owner)),
      groupIds: [],
    },
    {
      key: "disableWorkspaceAnalytics",
      label: WORKSPACE_ANALYTICS_LABEL,
      description: WORKSPACE_ANALYTICS_DESCRIPTION,
      value: booleanToggle(isWorkspaceAnalyticsEnabled(owner)),
      groupIds: [],
    },
    {
      key: "inactiveAgentArchivalThresholdDays",
      label: INACTIVE_AGENT_ARCHIVAL_LABEL,
      description: INACTIVE_AGENT_ARCHIVAL_DESCRIPTION,
      value: (
        <div className="flex items-center gap-2">
          {booleanToggle(inactiveAgentArchivalThresholdDays !== null)}
          {inactiveAgentArchivalThresholdDays !== null && (
            <Chip color="info">
              {`After ${inactiveAgentArchivalThresholdDays} days`}
            </Chip>
          )}
        </div>
      ),
      groupIds: [],
    },
  ];
}

function buildMessagingAppRows(
  owner: LightWorkspaceType,
  messagingApps: PokeMessagingApp[]
): GovernanceRow[] {
  return messagingApps.map((messagingApp) => {
    const { name, description } = MESSAGING_APP_METADATA[messagingApp.provider];

    return {
      key: messagingApp.provider,
      label: name,
      description,
      value: (
        <div className="flex items-center gap-2">
          {booleanToggle(messagingApp.isBotEnabled)}
          {!messagingApp.isConnected && <Chip color="info">Not connected</Chip>}
          {messagingApp.dataSourceId && (
            <LinkWrapper
              href={`/poke/${owner.sId}/data_sources/${messagingApp.dataSourceId}`}
            >
              <Chip size="xs">Data source</Chip>
            </LinkWrapper>
          )}
        </div>
      ),
      groupIds: [],
    };
  });
}

interface GovernanceTabProps {
  owner: LightWorkspaceType;
}

export function GovernanceTab({ owner }: GovernanceTabProps) {
  const {
    data: governancePermissions,
    isLoading: isGovernancePermissionsLoading,
    isError: isGovernancePermissionsError,
  } = usePokeGovernancePermissions({ owner });
  const {
    data: groups,
    isLoading: isGroupsLoading,
    isError: isGroupsError,
  } = usePokeGroups({ owner });
  const {
    data: messagingApps,
    isLoading: isMessagingAppsLoading,
    isError: isMessagingAppsError,
  } = usePokeMessagingApps({ owner });

  if (
    isGovernancePermissionsLoading ||
    isGroupsLoading ||
    isMessagingAppsLoading
  ) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isGovernancePermissionsError || isGroupsError || isMessagingAppsError) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p>Error loading governance settings.</p>
      </div>
    );
  }

  const groupsById = new Map(groups.map((group) => [group.sId, group]));

  const sections: GovernanceSection[] = [
    ...PERMISSION_SECTIONS.map(({ label, capabilities }) => ({
      label,
      rows: buildPermissionRows(capabilities, governancePermissions),
      showGroups: true,
    })),
    { label: "Pods", rows: buildPodRows(owner), showGroups: false },
    { label: "Features", rows: buildFeatureRows(owner), showGroups: false },
    {
      label: "Messaging apps",
      rows: buildMessagingAppRows(owner, messagingApps),
      showGroups: false,
    },
  ].filter((section) => section.rows.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <GovernanceSectionTable
          key={section.label}
          owner={owner}
          section={section}
          groupsById={groupsById}
        />
      ))}
    </div>
  );
}

interface GovernanceSectionTableProps {
  owner: LightWorkspaceType;
  section: GovernanceSection;
  groupsById: Map<string, GroupType>;
}

// `table-fixed` with explicit column widths keeps every section's columns aligned with the others.
function GovernanceSectionTable({
  owner,
  section,
  groupsById,
}: GovernanceSectionTableProps) {
  return (
    <div className="flex flex-grow flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">{section.label}</h2>
      <PokeTable className="table-fixed">
        <PokeTableHeader>
          <PokeTableRow>
            <PokeTableHead className="w-1/2">Setting</PokeTableHead>
            <PokeTableHead className="w-1/4">Value</PokeTableHead>
            {section.showGroups && (
              <PokeTableHead className="w-1/4">Groups</PokeTableHead>
            )}
          </PokeTableRow>
        </PokeTableHeader>
        <PokeTableBody>
          {section.rows.map((row) => (
            <PokeTableRow key={row.key}>
              <PokeTableCell>
                <div className="font-medium">{row.label}</div>
                <div className="text-sm text-muted-foreground">
                  {row.description}
                </div>
              </PokeTableCell>
              <PokeTableCell>{row.value}</PokeTableCell>
              {section.showGroups && (
                <PokeTableCell>
                  {row.groupIds.length === 0 ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {row.groupIds.map((groupId) => (
                        <LinkWrapper
                          key={groupId}
                          href={`/poke/${owner.sId}/groups/${groupId}`}
                        >
                          <Chip size="xs">
                            {groupsById.get(groupId)?.name ?? groupId}
                          </Chip>
                        </LinkWrapper>
                      ))}
                    </div>
                  )}
                </PokeTableCell>
              )}
            </PokeTableRow>
          ))}
        </PokeTableBody>
      </PokeTable>
    </div>
  );
}
