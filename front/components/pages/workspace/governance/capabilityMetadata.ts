import type {
  CapabilityKey,
  CapabilitySpec,
} from "@app/types/group_permissions";
import { capabilityKey } from "@app/types/group_permissions";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type GovernanceSettingMetadata = {
  label: MessageDescriptor;
  description: MessageDescriptor;
  /** Extra tokens for admin settings search (beyond the label). */
  searchKeywords: MessageDescriptor;
  isGroupsOnly?: boolean;
};

export const GOVERNANCE_SETTING_METADATA: Partial<
  Record<CapabilityKey, GovernanceSettingMetadata>
> = {
  "create:agent": {
    label: msg`Create agents`,
    description: msg`Who can create agents in the Agent Builder`,
    searchKeywords: msg`who can create agents agent builder permission`,
  },
  "publish:agent": {
    label: msg`Publish agents`,
    description: msg`Who can publish agents to the whole workspace`,
    searchKeywords: msg`publish to whole workspace permission`,
  },
  "create:skill": {
    label: msg`Create skills`,
    description: msg`Who can create custom skills`,
    searchKeywords: msg`custom skills permission`,
  },
  "publish:skill": {
    label: msg`Manage skill availability`,
    description: msg`Who can make skills available across the workspace`,
    searchKeywords: msg`skills available across workspace`,
  },
  "make_discoverable:skill": {
    label: msg`Make skills discoverable to agents`,
    description: msg`Who can make skills discoverable to @Dust and agents with Discover Skills`,
    searchKeywords: msg`@dust discover skills`,
  },
  "invite:frame": {
    label: msg`Invite people by email`,
    description: msg`Who can share frames by email with people outside your organization`,
    searchKeywords: msg`frames external sharing`,
  },
  "publish:frame": {
    label: msg`Share by public link`,
    description: msg`Who can create public links to frames`,
    searchKeywords: msg`frames public links`,
  },
  "admin:billing": {
    label: msg`Access billing features`,
    description: msg`Who can manage billing settings, invoices, and payment methods`,
    searchKeywords: msg`billing settings invoices payment methods groups`,
    isGroupsOnly: true,
  },
  "admin:security": {
    label: msg`Access security features`,
    description: msg`Who can manage user access, identities, and provisioning`,
    searchKeywords: msg`user access identities provisioning groups`,
    isGroupsOnly: true,
  },
  "use_workspace_pool:trigger": {
    label: msg`Charge automations to the workspace`,
    description: msg`Who can run a trigger on the workspace credit pool instead of their own`,
    searchKeywords: msg`trigger workspace credit pool instead of their own`,
  },
};

export function getGovernancePermissionMetadata(
  capability: CapabilitySpec
): GovernanceSettingMetadata | null {
  return GOVERNANCE_SETTING_METADATA[capabilityKey(capability)] ?? null;
}
