import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const P = ADMIN_SECTION_IDS.people;
const PAGE = "members" as const;

export const INVITE_MEMBERS_LABEL = "Invite members";
export const CREATE_GROUP_LABEL = "Create group";

/**
 * Search entries for People. Tab targets match MembersPage `?tab=` values.
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
    P.groups,
    [
      ["Groups", "team groups"],
      [CREATE_GROUP_LABEL, "add group new group"],
      ["Edit group", "group members managers"],
    ],
    "groups"
  ),
];
