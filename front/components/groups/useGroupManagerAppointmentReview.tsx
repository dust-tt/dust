import { ConfirmContext } from "@app/components/Confirm";
import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import type { GroupType } from "@app/types/groups";
import { isRegularManualGroupKind } from "@app/types/groups";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useContext } from "react";

interface GroupManagerAppointmentReviewProps {
  group: Pick<GroupType, "name" | "kind" | "grantedRole"> | null;
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
  const { t } = useLingui();
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
    const groupName = group.name;
    const [firstManager] = managersNeedingWarning;
    const managerCount = managersNeedingWarning.length;
    let title: string;
    let message: string;
    if (managerCount === 1) {
      const { fullName, firstName } = firstManager;
      title = t`${fullName} isn't a member of ${groupName}`;
      message = t`As manager, they can add anyone to the group, including themselves. Anyone they add gains the group's permissions and access to every space and data source shared with it. Continue only if you trust ${firstName} with those permissions.`;
    } else {
      title = t`${plural(managerCount, {
        one: `# person you're appointing isn't a member of ${groupName}`,
        other: `# people you're appointing aren't members of ${groupName}`,
      })}`;
      message = t`As managers, they can add anyone to the group, including themselves. Anyone they add gains the group's permissions and access to every space and data source shared with it. Continue only if you trust them with those permissions.`;
    }
    return confirm({
      title,
      message,
      validateLabel: t`Appoint anyway`,
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
