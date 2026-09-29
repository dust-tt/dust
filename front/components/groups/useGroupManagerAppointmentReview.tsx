import { ConfirmContext } from "@app/components/Confirm";
import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import type { GroupWithAllowedActions } from "@app/types/api/groups";
import { isRegularManualGroupKind } from "@app/types/groups";
import { useContext } from "react";

interface GroupManagerAppointmentReviewProps {
  group: GroupWithAllowedActions | null;
  initialManagers: SearchMemberType[];
  selectedManagers: SearchMemberType[];
  initialMembers: SearchMemberType[];
  selectedMemberIds: Set<string>;
}

/**
 * @cc [owner:philipperolet,label:product;security] outside-group-manager-review
 * For a regular manual group that does not grant the Admin role, appointing a new manager
 * who is not a member MUST require confirmation explaining that anyone they add gains the
 * group's permissions and access to shared spaces and data sources.
 */
export function useGroupManagerAppointmentReview({
  group,
  initialManagers,
  selectedManagers,
  initialMembers,
  selectedMemberIds,
}: GroupManagerAppointmentReviewProps) {
  const confirm = useContext(ConfirmContext);

  const managersNeedingWarning =
    group &&
    isRegularManualGroupKind(group.kind) &&
    group.grantedRole !== "admin"
      ? newManagersOutsideGroup({
          initialManagers,
          selectedManagers,
          initialMembers,
          selectedMemberIds,
        })
      : [];

  const confirmAppointment = async (): Promise<boolean> => {
    if (!group || managersNeedingWarning.length === 0) {
      return true;
    }
    const isSingleManager = managersNeedingWarning.length === 1;
    const trustMessage = isSingleManager
      ? `Continue only if you trust ${managersNeedingWarning[0].firstName} with those permissions.`
      : "Continue only if you trust them with those permissions.";
    return confirm({
      title: isSingleManager
        ? `${managersNeedingWarning[0].fullName} isn't a member of ${group.name}`
        : `${managersNeedingWarning.length} people you're appointing aren't members of ${group.name}`,
      message: `As ${isSingleManager ? "manager" : "managers"}, they can add anyone to the group, including themselves. Anyone they add gains the group's permissions and access to every space and data source shared with it. ${trustMessage}`,
      validateLabel: "Appoint anyway",
      validateVariant: "highlight",
    });
  };

  return {
    confirmAppointment,
  };
}

export function newManagersOutsideGroup({
  initialManagers,
  selectedManagers,
  initialMembers,
  selectedMemberIds,
}: {
  initialManagers: SearchMemberType[];
  selectedManagers: SearchMemberType[];
  initialMembers: SearchMemberType[];
  selectedMemberIds: Set<string>;
}): SearchMemberType[] {
  const initialManagerIds = new Set(
    initialManagers.map((manager) => manager.sId)
  );
  const initialMemberIds = new Set(initialMembers.map((member) => member.sId));

  return selectedManagers.filter(
    (manager) =>
      !initialManagerIds.has(manager.sId) &&
      (!initialMemberIds.has(manager.sId) ||
        !selectedMemberIds.has(manager.sId))
  );
}
