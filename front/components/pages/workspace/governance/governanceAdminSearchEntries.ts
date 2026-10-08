import { getGovernancePermissionMetadata } from "@app/components/pages/workspace/governance/capabilityMetadata";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { GOVERNANCE_CAPABILITIES } from "@app/types/group_permissions";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

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
    {
      sectionId: AdminSectionId;
      tab: string;
      items: [MessageDescriptor, MessageDescriptor][];
    }
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
      bucket.items.push([metadata.label, metadata.searchKeywords]);
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
    [msg`Workspace Name`, msg`rename workspace organization name`],
  ]),
  ...capabilityEntries(),
  ...adminSearchEntries(
    PAGE,
    S.settings,
    [
      [
        msg`Allow self-improving skills`,
        msg`self improving skills reinforcement analyze conversations`,
      ],
      [
        msg`Enable batch processing`,
        msg`self improving skills zdr immediate data deletion batches`,
      ],
    ],
    "agents"
  ),
  ...adminSearchEntries(
    PAGE,
    S.skills,
    [[msg`Skills`, msg`per skill editors enabled currently spent lock state`]],
    "agents"
  ),
  ...adminSearchEntries(
    PAGE,
    G.frame,
    [[msg`Frame sharing`, msg`shareable outside workspace restriction`]],
    "pods"
  ),
  ...adminSearchEntries(
    PAGE,
    G.pods,
    [
      [msg`Restricted and open Pods`, msg`members create open pods`],
      [msg`Pod files`, msg`manually add files to pods manual updates`],
    ],
    "pods"
  ),
  ...adminSearchEntries(
    PAGE,
    G.features,
    [
      [msg`Default agent`, msg`workspace default agent picker`],
      [msg`Language`, msg`locale localisation`],
      [msg`Voice transcription`, msg`dictation conversations`],
      [msg`Email and Slack notifications`, msg`conversation notifications`],
      [
        msg`Private conversation URLs by default`,
        msg`conversation privacy participants`,
      ],
      [msg`Workspace Analyst`, msg`analyst agent analytics tools admins`],
      [msg`Archive unused agents`, msg`archive them once auto`],
      [
        msg`Inactivity threshold`,
        msg`days unmentioned archived schedule wake-up excluded`,
      ],
    ],
    "features"
  ),
];
