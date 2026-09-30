import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";

interface GroupManagersFieldProps {
  owner: LightWorkspaceType;
  group: GroupType;
  managers: SearchMemberType[];
  onChange: (managers: SearchMemberType[]) => void;
  disabled?: boolean;
}

export function GroupManagersField({
  owner,
  group,
  managers,
  onChange,
  disabled = false,
}: GroupManagersFieldProps) {
  const membershipDescription =
    group.kind === "provisioned"
      ? "Membership stays managed by your directory."
      : group.grantedRole === "admin"
        ? "Only workspace admins can change this group's members."
        : "They can add themselves or others, giving them any access, workspace role, permissions, or seats this group grants.";

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        Group managers ({managers.length})
      </h3>
      <p className="text-sm text-muted-foreground">
        Group managers can manage usage and credit limits for this group's
        members. {membershipDescription}
      </p>
      <MemberSelectionTable
        owner={owner}
        selectedMemberIds={new Set(managers.map((manager) => manager.sId))}
        onSelectionChange={(_, users) => onChange(users)}
        initialMembers={managers}
        disabled={disabled}
      />
    </div>
  );
}
