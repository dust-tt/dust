import type {
  MemberRowData,
  SearchMemberType,
} from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, Tooltip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

interface GroupManagersFieldProps {
  owner: LightWorkspaceType;
  group: GroupType;
  managers: SearchMemberType[];
  groupMemberIds: Set<string>;
  onChange: (managers: SearchMemberType[]) => void;
  disabled?: boolean;
}

/**
 * @cc [owner:philipperolet,label:product] manager-membership-badge
 * Selected managers absent from groupMemberIds MUST be marked as non-members. Callers MUST exclude
 * pending additions and removals from groupMemberIds. Membership warnings MUST reflect the
 * group's directory-managed or Admin-only restrictions when applicable.
 */
export function GroupManagersField({
  owner,
  group,
  managers,
  groupMemberIds,
  onChange,
  disabled = false,
}: GroupManagersFieldProps) {
  const membershipRestriction =
    group.kind === "provisioned"
      ? "Membership stays managed by your directory."
      : group.grantedRole === "admin"
        ? "Only workspace admins can change this group's members."
        : null;
  const managerIds = new Set(managers.map((manager) => manager.sId));
  const membershipColumns: ColumnDef<MemberRowData>[] = [
    {
      id: "membership",
      meta: { className: "w-36" },
      cell: ({ row }) => {
        const { sId, fullName } = row.original;
        if (!managerIds.has(sId) || groupMemberIds.has(sId)) {
          return null;
        }
        return (
          <Tooltip
            tooltipTriggerAsChild
            trigger={
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
              >
                <Chip color="info" size="xs" label="Not group member" />
              </button>
            }
            label={`${fullName} isn't a member of ${group.name} but can manage it. ${membershipRestriction ?? "They can grant themselves access to the group's permissions and data."}`}
          />
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        Group managers ({managers.length})
      </h3>
      <p className="text-sm text-muted-foreground">
        {membershipRestriction
          ? `Group managers can manage usage and credit limits for this group's members. ${membershipRestriction}`
          : "Group managers can add members and set their usage and credit limits."}
      </p>
      <MemberSelectionTable
        owner={owner}
        selectedMemberIds={managerIds}
        onSelectionChange={(_, users) => onChange(users)}
        initialMembers={managers}
        extraColumns={membershipColumns}
        disabled={disabled}
      />
    </div>
  );
}
