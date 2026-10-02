import { displayRoleCapitalized } from "@app/components/members/Roles";
import { getGovernancePermissionMetadata } from "@app/components/pages/workspace/governance/capabilityMetadata";
import { DIRECTORY_SYNC_LABEL } from "@app/components/workspace/DirectorySync";
import { AUTO_JOIN_WORKSPACE_LABEL } from "@app/components/workspace/sso/AutoJoinToggle";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { GOVERNANCE_CAPABILITIES } from "@app/types/group_permissions";
import { GROUP_GRANTABLE_ROLES } from "@app/types/groups";

const P = ADMIN_SECTION_IDS.people;
const G = ADMIN_SECTION_IDS.governance;
const I = ADMIN_SECTION_IDS.identity;
const PAGE = "members" as const;

export const INVITE_MEMBERS_LABEL = "Invite members";
export const CREATE_GROUP_LABEL = "Create group";

function billingAndSecurityEntries(): AdminSettingEntry[] {
  const items: [string, string][] = [];
  for (const capability of GOVERNANCE_CAPABILITIES.billingAndSecurity) {
    const metadata = getGovernancePermissionMetadata(capability);
    if (metadata) {
      items.push([metadata.label, metadata.searchKeywords ?? ""]);
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
      ["Members", "people team roster roles"],
      [INVITE_MEMBERS_LABEL, "add member invite member email invitation"],
      ["Pending invitations", "invited pending invite"],
      ["Change member role", "admin manager user role"],
    ],
    "members"
  ),
  ...adminSearchEntries(
    PAGE,
    P.joining,
    [[AUTO_JOIN_WORKSPACE_LABEL, "verified domain auto join enrollment"]],
    "members"
  ),
  ...adminSearchEntries(
    PAGE,
    P.groups,
    [
      ["Groups", "team groups"],
      [CREATE_GROUP_LABEL, "add group new group"],
      ["Edit group", "group members managers"],
    ],
    "groups"
  ),
  ...adminSearchEntries(
    PAGE,
    I.provisioning,
    [
      [
        DIRECTORY_SYNC_LABEL,
        "gsuite google workspace scim workos provisioning",
      ],
    ],
    "groups"
  ),
  ...adminSearchEntries(
    PAGE,
    G.roles,
    GROUP_GRANTABLE_ROLES.map((role) => [
      displayRoleCapitalized(role),
      role === "admin"
        ? "full administrative control role groups"
        : "members groups roles analytics",
    ]),
    "roles"
  ),
  ...billingAndSecurityEntries(),
];
