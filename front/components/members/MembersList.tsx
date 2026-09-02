import type { SearchMemberWithWorkspaceType } from "@app/components/members/MemberSelectionTable";
import { isFullUserType } from "@app/components/members/MemberSelectionTable";
import {
  displayRole,
  normalizeDisplayRole,
  ROLES_DATA,
} from "@app/components/members/Roles";
import { ModelTiersInfoButton } from "@app/components/workspace/ModelTiersInfoModal";
import type { SearchMembersAdminResponseBody } from "@app/lib/api/workspace";
import { formatModelTiersSummary } from "@app/lib/client/model_tiers";
import type { ResolvedAllowedModelTiers } from "@app/lib/model_tiers/resolve_allowed";
import { getMaxTierName } from "@app/lib/model_tiers/tier_order";
import assert from "@app/lib/utils/assert";
import type { MembershipOriginType } from "@app/types/memberships";
import type { RoleType, UserType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Chip,
  DataTable,
  IconButton,
  LoadingBlock,
  XClose,
} from "@dust-tt/sparkle";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import capitalize from "lodash/capitalize";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useMemo } from "react";
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
  modelTiers?: ResolvedAllowedModelTiers;
  menuItems?: MenuItem[];
};

type Info = CellContext<RowData, string>;

function RoleCell({ role }: { role: RoleType }) {
  // `builder` is deprecated: display it as a regular member.
  const displayedRole = normalizeDisplayRole(role);

  return (
    <DataTable.CellContent>
      <Chip
        label={capitalize(displayRole(displayedRole))}
        color={
          displayedRole !== "none"
            ? ROLES_DATA[displayedRole]["color"]
            : undefined
        }
      />
    </DataTable.CellContent>
  );
}

function getTableRows({
  allUsers,
  onClick,
  onRemoveMemberClick,
  getResolvedModelTiers,
  getMenuItems,
  currentUserId,
  allowRemoveSelfAndProvisionedUsers,
}: {
  allUsers: SearchMemberWithWorkspaceType[];
  onClick: (user: SearchMemberWithWorkspaceType) => void;
  onRemoveMemberClick?: (user: SearchMemberWithWorkspaceType) => void;
  getResolvedModelTiers?: (
    user: SearchMemberWithWorkspaceType
  ) => ResolvedAllowedModelTiers;
  getMenuItems?: (user: SearchMemberWithWorkspaceType) => MenuItem[];
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
      modelTiers: getResolvedModelTiers?.(user),
      menuItems: getMenuItems?.(user),
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

const memberColumns = [
  {
    id: "name" as const,
    header: "Name",
    cell: (info: Info) => (
      <DataTable.CellContent avatarUrl={info.row.original.icon} roundedAvatar>
        {info.row.original.name}
        {info.row.original.isCurrentUser && (
          <span className="ml-3 text-muted-foreground">(you)</span>
        )}
      </DataTable.CellContent>
    ),
    enableSorting: false,
  },
  {
    id: "email" as const,
    accessorKey: "email",
    header: "Email",
    cell: (info: Info) => (
      <DataTable.CellContent>{info.row.original.email}</DataTable.CellContent>
    ),
  },
  {
    id: "role" as const,
    header: "Role",
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
          <IconButton
            icon={XClose}
            onClick={info.row.original.onRemoveMemberClick}
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
    header: "Status",
    cell: (info: Info) => {
      return (
        <DataTable.CellContent>
          {info.row.original.status +
            (info.row.original.origin
              ? ` (${capitalize(info.row.original.origin)})`
              : "")}
        </DataTable.CellContent>
      );
    },
  },
  {
    id: "groups" as const,
    header: "Groups",
    cell: (info: Info) => (
      <DataTable.CellContent className="max-w-40 truncate capitalize">
        {info.row.original.groups.join(", ")}
      </DataTable.CellContent>
    ),
  },
  {
    id: "modelTiers" as const,
    header: () => (
      <span className="flex items-center gap-1">
        Models tier
        <ModelTiersInfoButton />
      </span>
    ),
    cell: (info: Info) => {
      const modelTiers = info.row.original.modelTiers;
      if (!modelTiers) {
        return null;
      }
      return (
        <DataTable.CellContent>
          <span className="text-sm text-muted-foreground">
            {formatModelTiersSummary(getMaxTierName(modelTiers.tiers))}
            {modelTiers.source === "user" ? " (custom)" : ""}
          </span>
        </DataTable.CellContent>
      );
    },
    meta: {
      className: "w-48",
    },
  },
  {
    id: "actions" as const,
    header: "",
    cell: (info: Info) => {
      const menuItems = info.row.original.menuItems;
      if (!menuItems) {
        return null;
      }
      return (
        <div
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DataTable.MoreButton menuItems={menuItems} />
        </div>
      );
    },
    meta: {
      className: "w-14",
    },
  },
];

export type MembersListColumn =
  | "name"
  | "email"
  | "role"
  | "remove"
  | "status"
  | "groups"
  | "modelTiers"
  | "actions";

interface MembersListProps {
  allowRemoveSelfAndProvisionedUsers?: boolean;
  currentUser: UserType | null;
  membersData: MembersData;
  onRowClick: (user: SearchMemberWithWorkspaceType) => void;
  onRemoveMemberClick?: (user: SearchMemberWithWorkspaceType) => void;
  getResolvedModelTiers?: (
    user: SearchMemberWithWorkspaceType
  ) => ResolvedAllowedModelTiers;
  getMenuItems?: (user: SearchMemberWithWorkspaceType) => MenuItem[];
  showColumns: MembersListColumn[];
  pagination?: PaginationState;
  setPagination?: (pagination: PaginationState) => void;
}

export function MembersList({
  allowRemoveSelfAndProvisionedUsers = false,
  currentUser,
  membersData,
  onRowClick,
  onRemoveMemberClick,
  getResolvedModelTiers,
  getMenuItems,
  showColumns,
  pagination,
  setPagination,
}: MembersListProps) {
  assert(
    !showColumns.includes("remove") || onRemoveMemberClick,
    "onRemoveMemberClick is required if remove column is shown"
  );
  assert(
    !showColumns.includes("modelTiers") || getResolvedModelTiers,
    "getResolvedModelTiers is required if modelTiers column is shown"
  );
  assert(
    !showColumns.includes("actions") || getMenuItems,
    "getMenuItems is required if actions column is shown"
  );

  const { members, totalMembersCount, isLoading } = membersData;

  const columns = memberColumns.filter((c) => showColumns.includes(c.id));

  const rows = useMemo(() => {
    const filteredMembers = members.filter((m) => m.workspace.role !== "none");
    return getTableRows({
      allUsers: filteredMembers,
      onClick: onRowClick,
      onRemoveMemberClick,
      getResolvedModelTiers,
      getMenuItems,
      currentUserId: currentUser?.sId ?? "current-user-not-loaded",
      allowRemoveSelfAndProvisionedUsers,
    });
  }, [
    members,
    onRowClick,
    onRemoveMemberClick,
    getResolvedModelTiers,
    getMenuItems,
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
