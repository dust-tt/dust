import { ConfirmContext } from "@app/components/Confirm";
import {
  GroupManagerAppointmentWarning,
  newManagersOutsideGroup,
} from "@app/components/groups/GroupManagerAppointmentWarning";
import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { useGovernancePermissions } from "@app/lib/swr/governance";
import type { GroupWithAllowedActions } from "@app/types/api/groups";
import { isRegularManualGroupKind } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { useContext } from "react";

interface GroupManagerAppointmentReviewProps {
  owner: LightWorkspaceType;
  group: GroupWithAllowedActions | null;
  initialManagers: SearchMemberType[];
  selectedManagers: SearchMemberType[];
  initialMembers: SearchMemberType[];
  selectedMemberIds: Set<string>;
}

/**
 * @cc [owner:philipperolet,label:product;security] outside-group-manager-review
 * For a regular manual group that does not grant the Admin role, appointing a new manager
 * who is not a member MUST require confirmation showing the group's access grants. If
 * those grants cannot be loaded, the appointment MUST stay blocked.
 */
export function useGroupManagerAppointmentReview({
  owner,
  group,
  initialManagers,
  selectedManagers,
  initialMembers,
  selectedMemberIds,
}: GroupManagerAppointmentReviewProps) {
  const confirm = useContext(ConfirmContext);
  const {
    governancePermissions,
    isLoading,
    isGovernancePermissionsError,
    mutateGovernancePermissions,
  } = useGovernancePermissions(owner, {
    disabled: group?.allowedActions?.canAssignManagers !== true,
  });

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

  const hasReviewError =
    managersNeedingWarning.length > 0 && isGovernancePermissionsError;
  const isReviewBlocked =
    managersNeedingWarning.length > 0 &&
    (isLoading || isGovernancePermissionsError);

  const confirmAppointment = async (): Promise<boolean> => {
    if (managersNeedingWarning.length === 0) {
      return true;
    }
    if (isReviewBlocked || !group) {
      return false;
    }
    return confirm({
      title: `Appoint ${managersNeedingWarning.map((manager) => manager.fullName).join(", ")} as group manager${managersNeedingWarning.length === 1 ? "" : "s"}?`,
      message: (
        <GroupManagerAppointmentWarning
          group={group}
          managers={managersNeedingWarning}
          governancePermissions={governancePermissions}
        />
      ),
      validateLabel:
        managersNeedingWarning.length === 1
          ? "Appoint manager"
          : "Appoint managers",
      validateVariant: "warning",
    });
  };

  return {
    confirmAppointment,
    hasReviewError,
    isReviewBlocked,
    retryReview: mutateGovernancePermissions,
  };
}
