import type {
  CapabilityKey,
  CapabilitySpec,
} from "@app/types/group_permissions";
import { capabilityKey } from "@app/types/group_permissions";

export type GovernanceSettingMetadata = {
  label: string;
  description: string;
  /** Extra tokens for admin settings search (beyond the label). */
  searchKeywords?: string;
  isGroupsOnly?: boolean;
};

export const GOVERNANCE_SETTING_METADATA: Partial<
  Record<CapabilityKey, GovernanceSettingMetadata>
> = {
  "create:agent": {
    label: "Create agents",
    description: "Who can create agents in the Agent Builder",
    searchKeywords: "who can create agents agent builder permission",
  },
  "publish:agent": {
    label: "Publish agents",
    description: "Who can publish agents to the whole workspace",
    searchKeywords: "publish to whole workspace permission",
  },
  "create:skill": {
    label: "Create skills",
    description: "Who can create custom skills",
    searchKeywords: "custom skills permission",
  },
  "publish:skill": {
    label: "Manage skill availability",
    description: "Who can make skills available across the workspace",
    searchKeywords: "skills available across workspace",
  },
  "make_discoverable:skill": {
    label: "Make skills discoverable to agents",
    description:
      "Who can make skills discoverable to @Dust and agents with Discover Skills",
    searchKeywords: "@dust discover skills",
  },
  "invite:frame": {
    label: "Invite people by email",
    description:
      "Who can share frames by email with people outside your organization",
    searchKeywords: "frames external sharing",
  },
  "publish:frame": {
    label: "Share by public link",
    description: "Who can create public links to frames",
    searchKeywords: "frames public links",
  },
  "admin:billing": {
    label: "Access billing features",
    description:
      "Who can manage billing settings, invoices, and payment methods",
    searchKeywords: "billing settings invoices payment methods groups",
    isGroupsOnly: true,
  },
  "admin:security": {
    label: "Access security features",
    description: "Who can manage user access, identities, and provisioning",
    searchKeywords: "user access identities provisioning groups",
    isGroupsOnly: true,
  },
  "use_workspace_pool:trigger": {
    label: "Charge automations to the workspace",
    description:
      "Who can run a trigger on the workspace credit pool instead of their own",
    searchKeywords: "trigger workspace credit pool instead of their own",
  },
};

export function getGovernancePermissionMetadata(
  capability: CapabilitySpec
): GovernanceSettingMetadata | null {
  return GOVERNANCE_SETTING_METADATA[capabilityKey(capability)] ?? null;
}
