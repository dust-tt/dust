import type { SearchMemberWithWorkspaceType } from "@app/components/members/MemberSelectionTable";
import { isFullUserType } from "@app/components/members/MemberSelectionTable";
import { ROLE_LABELS, ROLES_DATA } from "@app/components/members/Roles";
import type { SearchMembersAdminResponseBody } from "@app/lib/api/workspace";
import assert from "@app/lib/utils/assert";
import type { MembershipOriginType } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { RoleType, UserType } from "@app/types/user";
import {
  Button,
  Chip,
  DataTable,
  LoadingBlock,
  XClose,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import { useMemo } from "react";
import type { KeyedMutator } from "swr";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  email: string;
  role: RoleType;
  status: "Active" | "Unregistered";
  groups: string[];
  isCurrentUser: boolean;
  canRemove: boolean;
  onClick: () => void;
  onRemoveMemberClick?: () => void;
  origin?: MembershipOriginType;
};

type Info = CellContext<RowData, string>;

function RoleCell({ role }: { role: RoleType }) {
  const { t } = useLingui();
  return (
    <DataTable.CellContent>
      <Chip
        label={t(ROLE_LABELS[role])}
        color={role !== "none" ? ROLES_DATA[role]["color"] : undefined}
      />
    </DataTable.CellContent>
  );
}

interface StatusCellProps {
  status: RowData["status"];
  origin: MembershipOriginType | undefined;
}

function StatusCell({ status, origin }: StatusCellProps) {
  const { t } = useLingui();
  const isActive = status === "Active";
  let label: string;
  switch (origin) {
    case undefined:
      label = isActive ? t`Active` : t`Unregistered`;
      break;
    case "provisioned":
      label = isActive
        ? t`Active (Provisioned)`
        : t`Unregistered (Provisioned)`;
      break;
    case "invited":
      label = isActive ? t`Active (Invited)` : t`Unregistered (Invited)`;
      break;
    case "auto-joined":
      label = isActive
        ? t`Active (Auto-joined)`
        : t`Unregistered (Auto-joined)`;
      break;
    default:
      assertNeverAndIgnore(origin);
      label = isActive ? t`Active` : t`Unregistered`;
  }
  return <DataTable.CellContent>{label}</DataTable.CellContent>;
}

function getTableRows({
  allUsers,
  onClick,
  onRemoveMemberClick,
  currentUserId,
  allowRemoveSelfAndProvisionedUsers,
}: {
  allUsers: SearchMemberWithWorkspaceType[];
  onClick: (user: SearchMemberWithWorkspaceType) => void;
  onRemoveMemberClick?: (user: SearchMemberWithWorkspaceType) => void;
  currentUserId: string;
  allowRemoveSelfAndProvisionedUsers: boolean;
}): RowData[] {
  return allUsers.map((user) => {
    const fullUser = isFullUserType(user);
    const isCurrentUser = user.sId === currentUserId;
    const origin = fullUser ? user.origin : undefined;
    return {
      icon: user.image ?? "",
      name: user.fullName,
      userId: user.sId,
      email: user.email ?? "",
      role: user.workspace.role ?? "none",
      status: fullUser && user.lastLoginAt === null ? "Unregistered" : "Active",
      groups: user.workspace.groups ?? [],
      isCurrentUser,
      canRemove:
        allowRemoveSelfAndProvisionedUsers ||
        (!isCurrentUser && origin !== "provisioned"),
      onClick: () => onClick(user),
      onRemoveMemberClick: () => onRemoveMemberClick?.(user),
      origin,
    };
  });
}

type MembersData = {
  members: SearchMemberWithWorkspaceType[];
  totalMembersCount: number;
  isLoading: boolean;
  mutateRegardlessOfQueryParams:
    | KeyedMutator<SearchMembersAdminResponseBody>
    | (() => void);
};

interface MembersListProps {
  allowRemoveSelfAndProvisionedUsers?: boolean;
  currentUser: UserType | null;
  membersData: MembersData;
  onRowClick: (user: SearchMemberWithWorkspaceType) => void;
  onRemoveMemberClick?: (user: SearchMemberWithWorkspaceType) => void;
  showColumns: ("name" | "email" | "role" | "remove" | "status" | "groups")[];
  pagination?: PaginationState;
  setPagination?: (pagination: PaginationState) => void;
}

export function MembersList({
  allowRemoveSelfAndProvisionedUsers = false,
  currentUser,
  membersData,
  onRowClick,
  onRemoveMemberClick,
  showColumns,
  pagination,
  setPagination,
}: MembersListProps) {
  const { t } = useLingui();
  assert(
    !showColumns.includes("remove") || onRemoveMemberClick,
    "onRemoveMemberClick is required if remove column is shown"
  );

  const { members, totalMembersCount, isLoading } = membersData;

  const memberColumns = useMemo(
    () => [
      {
        id: "name" as const,
        header: t`Name`,
        cell: (info: Info) => (
          <DataTable.CellContent
            avatarName={info.row.original.name}
            avatarUrl={info.row.original.icon ?? undefined}
            roundedAvatar
          >
            {info.row.original.name}
            {info.row.original.isCurrentUser && (
              <span className="ml-3 text-muted-foreground">
                <Trans>(you)</Trans>
              </span>
            )}
          </DataTable.CellContent>
        ),
        enableSorting: false,
      },
      {
        id: "email" as const,
        accessorKey: "email",
        header: t`Email`,
        cell: (info: Info) => (
          <DataTable.CellContent>
            {info.row.original.email}
          </DataTable.CellContent>
        ),
      },
      {
        id: "role" as const,
        header: t`Role`,
        accessorFn: (row: RowData) => row.role,
        cell: (info: Info) => <RoleCell role={info.row.original.role} />,
        meta: {
          className: "w-32",
        },
      },
      {
        id: "remove" as const,
        header: "",
        cell: (info: Info) => (
          <DataTable.CellContent>
            {info.row.original.canRemove && (
              <Button
                icon={XClose}
                onClick={info.row.original.onRemoveMemberClick}
                variant="ghost-secondary"
              />
            )}
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-12",
        },
      },
      {
        id: "status" as const,
        header: t`Status`,
        cell: (info: Info) => (
          <StatusCell
            status={info.row.original.status}
            origin={info.row.original.origin}
          />
        ),
      },
      {
        id: "groups" as const,
        header: t`Groups`,
        cell: (info: Info) => (
          <DataTable.CellContent className="max-w-40 truncate capitalize">
            {info.row.original.groups.join(", ")}
          </DataTable.CellContent>
        ),
      },
    ],
    [t]
  );

  const columns = memberColumns.filter((c) => showColumns.includes(c.id));

  const rows = useMemo(() => {
    const filteredMembers = members.filter((m) => m.workspace.role !== "none");
    return getTableRows({
      allUsers: filteredMembers,
      onClick: onRowClick,
      onRemoveMemberClick,
      currentUserId: currentUser?.sId ?? "current-user-not-loaded",
      allowRemoveSelfAndProvisionedUsers,
    });
  }, [
    members,
    onRowClick,
    onRemoveMemberClick,
    currentUser?.sId,
    allowRemoveSelfAndProvisionedUsers,
  ]);

  return (
    <>
      {isLoading ? (
        <div className="flex w-full flex-col space-y-2">
          <LoadingBlock className="h-8 w-full rounded-xl" />
          <LoadingBlock className="h-8 w-full rounded-xl" />
          <LoadingBlock className="h-8 w-full rounded-xl" />
        </div>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          pagination={pagination}
          setPagination={setPagination}
          totalRowCount={totalMembersCount}
        />
      )}
    </>
  );
}
