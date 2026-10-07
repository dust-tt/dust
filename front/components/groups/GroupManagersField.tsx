import type {
  MemberRowData,
  SearchMemberType,
} from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, Tooltip } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";

interface GroupManagersFieldProps {
  owner: LightWorkspaceType;
  group: Pick<GroupType, "name" | "kind" | "grantedRole">;
  managers: SearchMemberType[];
  groupMemberIds: Set<string>;
  onChange: (managers: SearchMemberType[]) => void;
  disabled?: boolean;
}

/**
 * @cc [owner:philipperolet,label:product] manager-membership-badge
 * Selected managers and search results absent from groupMemberIds MUST be marked as non-members.
 * Callers MUST exclude pending additions and removals from groupMemberIds. Membership warnings MUST
 * reflect the group's directory-managed or Admin-only restrictions when applicable.
 */
export function GroupManagersField({
  owner,
  group,
  managers,
  groupMemberIds,
  onChange,
  disabled = false,
}: GroupManagersFieldProps) {
  const { t } = useLingui();
  const groupName = group.name;
  const managerCount = managers.length;
  const membershipRestriction =
    group.kind === "provisioned"
      ? t`Membership stays managed by your directory.`
      : group.grantedRole === "admin"
        ? t`Only workspace admins can change this group's members.`
        : null;
  const limitsMessage = t`Group managers can manage usage and credit limits for this group's members.`;
  const managerIds = new Set(managers.map((manager) => manager.sId));
  const membershipColumns: ColumnDef<MemberRowData>[] = [
    {
      id: "membership",
      meta: { className: "w-36" },
      cell: ({ row }) => {
        const { sId, fullName } = row.original;
        if (groupMemberIds.has(sId)) {
          return null;
        }
        const notMemberMessage = t`${fullName} isn't a member of ${groupName} but can manage it.`;
        const accessMessage =
          membershipRestriction ??
          t`They can grant themselves access to the group's permissions and data.`;
        return (
          <Tooltip
            tooltipTriggerAsChild
            trigger={
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
              >
                <Chip
                  color="highlight"
                  size="mini"
                  label={t`Not group member`}
                />
              </button>
            }
            label={`${notMemberMessage} ${accessMessage}`}
          />
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        <Trans>Group managers ({managerCount})</Trans>
      </h3>
      <p className="text-sm text-muted-foreground">
        {membershipRestriction
          ? `${limitsMessage} ${membershipRestriction}`
          : t`Group managers can add members and set their usage and credit limits.`}
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
