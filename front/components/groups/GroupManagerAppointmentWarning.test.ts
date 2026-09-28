import { newManagersOutsideGroup } from "@app/components/groups/GroupManagerAppointmentWarning";
import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { describe, expect, it } from "vitest";

const member = (sId: string): SearchMemberType => ({
  sId,
  firstName: sId,
  lastName: "User",
  fullName: `${sId} User`,
  email: `${sId}@example.com`,
  image: null,
});

describe("newManagersOutsideGroup", () => {
  it("warns for new non-members, including pending removals and unsaved additions", () => {
    const originalManager = member("original-manager");
    const currentMember = member("current-member");
    const removedMember = member("removed-member");
    const newMember = member("new-member");
    const outsider = member("outsider");

    const managers = newManagersOutsideGroup({
      initialManagers: [originalManager],
      selectedManagers: [
        originalManager,
        currentMember,
        removedMember,
        newMember,
        outsider,
      ],
      initialMembers: [currentMember, removedMember],
      selectedMemberIds: new Set([currentMember.sId, newMember.sId]),
    });

    expect(managers.map((manager) => manager.sId)).toEqual([
      "removed-member",
      "new-member",
      "outsider",
    ]);
  });
});
