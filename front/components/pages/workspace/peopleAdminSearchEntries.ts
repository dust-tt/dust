import { ROLE_LABELS } from "@app/components/members/Roles";
import { getGovernancePermissionMetadata } from "@app/components/pages/workspace/governance/capabilityMetadata";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { GOVERNANCE_CAPABILITIES } from "@app/types/group_permissions";
import { GROUP_GRANTABLE_ROLES } from "@app/types/groups";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

const P = ADMIN_SECTION_IDS.people;
const G = ADMIN_SECTION_IDS.governance;
const I = ADMIN_SECTION_IDS.identity;
const PAGE = "members" as const;

export const INVITE_MEMBERS_LABEL = msg`Invite members`;
export const CREATE_GROUP_LABEL = msg`Create group`;

function billingAndSecurityEntries(): AdminSettingEntry[] {
  const items: [MessageDescriptor, MessageDescriptor][] = [];
  for (const capability of GOVERNANCE_CAPABILITIES.billingAndSecurity) {
    const metadata = getGovernancePermissionMetadata(capability);
    if (metadata) {
      items.push([metadata.label, metadata.searchKeywords]);
    }
  }
  return adminSearchEntries(PAGE, G.billing, items, "roles");
}

/**
 * Search entries for Members. Tab targets match MembersPage `?tab=` values.
 */
export const PEOPLE_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    P.members,
    [
      [msg`Members`, msg`people team roster roles`],
      [INVITE_MEMBERS_LABEL, msg`add member invite member email invitation`],
      [msg`Pending invitations`, msg`invited pending invite`],
      [msg`Change member role`, msg`admin manager user role`],
    ],
    "members"
  ),
  ...adminSearchEntries(
    PAGE,
    P.joining,
    [[msg`Auto-join Workspace`, msg`verified domain auto join enrollment`]],
    "members"
  ),
  ...adminSearchEntries(
    PAGE,
    P.groups,
    [
      [msg`Groups`, msg`team groups`],
      [CREATE_GROUP_LABEL, msg`add group new group`],
      [msg`Edit group`, msg`group members managers`],
    ],
    "groups"
  ),
  ...adminSearchEntries(
    PAGE,
    I.provisioning,
    [
      [
        msg`Directory sync`,
        msg`gsuite google workspace scim workos provisioning`,
      ],
    ],
    "groups"
  ),
  ...adminSearchEntries(
    PAGE,
    G.roles,
    [
      [msg`Roles`, msg`role provisioning grantable roles groups`],
      ...GROUP_GRANTABLE_ROLES.map(
        (role) =>
          [
            ROLE_LABELS[role],
            role === "admin"
              ? msg`full administrative control role groups`
              : msg`members groups roles analytics`,
          ] as [MessageDescriptor, MessageDescriptor]
      ),
    ],
    "roles"
  ),
  ...billingAndSecurityEntries(),
];
