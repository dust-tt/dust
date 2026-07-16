import { GroupDialog } from "@app/components/groups/GroupDialog";
import { LinkedSectionNotice } from "@app/components/workspace/LinkedSectionNotice";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useGroups } from "@app/lib/swr/groups";
import {
  type GroupKind,
  isRegularManualGroupKind,
  MANAGEABLE_GROUP_KINDS,
} from "@app/types/groups";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  DataTable,
  EmptyCTA,
  Plus,
  SearchInput,
  Spinner,
  Users01,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

type ChipColor = NonNullable<React.ComponentProps<typeof Chip>["color"]>;

function getGroupKindChip(kind: GroupKind): {
  label: string;
  color: ChipColor;
} {
  switch (kind) {
    case "provisioned":
      return { label: "Provisioned", color: "success" };
    default:
      return { label: kind, color: "primary" };
  }
}

type GroupRowData = {
  groupId: string;
  name: string;
  memberCount: number;
  kind: GroupKind;
  onClick?: () => void;
};

type GroupInfo = CellContext<GroupRowData, unknown>;

interface WorkspaceGroupsListProps {
  owner: WorkspaceType;
}

const columns: ColumnDef<GroupRowData>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    meta: { className: "w-full" },
    cell: (info: GroupInfo) => {
      const { name, memberCount } = info.row.original;
      return (
        <DataTable.CellContent
          icon={Users01}
          description={`${memberCount} member${pluralize(memberCount)}`}
        >
          {name}
        </DataTable.CellContent>
      );
    },
  },
  {
    id: "kind",
    header: "",
    meta: { className: "w-[160px]" },
    cell: (info: GroupInfo) => {
      const { label, color } = getGroupKindChip(info.row.original.kind);
      return (
        <DataTable.CellContent>
          <Chip size="xs" color={color} label={label} />
        </DataTable.CellContent>
      );
    },
  },
];

export function WorkspaceGroupsList({ owner }: WorkspaceGroupsListProps) {
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
  });

  const router = useAppRouter();
  const { subscription } = useAuth();
  const isScimAllowed = subscription.plan.limits.users.isSCIMAllowed;
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editedGroupId, setEditedGroupId] = useState<string | null>(null);

  const openCreateDialog = () => {
    setEditedGroupId(null);
    setIsDialogOpen(true);
  };

  const rows = useMemo<GroupRowData[]>(() => {
    return groups.map((group) => ({
      groupId: group.sId,
      name: group.name,
      memberCount: group.memberCount,
      kind: group.kind,
      onClick: isRegularManualGroupKind(group.kind)
        ? () => {
            setEditedGroupId(group.sId);
            setIsDialogOpen(true);
          }
        : undefined,
    }));
  }, [groups]);

  return (
    <div className="flex flex-col gap-4">
      {isScimAllowed && (
        <LinkedSectionNotice
          description="User provisioning is configured in"
          linkLabel="IT & Security → User provisioning"
          onLinkClick={() =>
            void router.push(`/w/${owner.sId}/identity-and-provisioning`)
          }
        />
      )}
      {isGroupsLoading && (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      )}
      {!isGroupsLoading &&
        (rows.length > 0 ? (
          <>
            <div className="flex flex-row gap-2">
              <SearchInput
                placeholder="Search groups"
                value={searchTerm}
                name="search"
                onChange={setSearchTerm}
                className="w-full"
              />
              <Button
                icon={Plus}
                label="Create group"
                onClick={openCreateDialog}
              />
            </div>
            <DataTable
              data={rows}
              columns={columns}
              filter={searchTerm}
              filterColumn="name"
            />
          </>
        ) : (
          <EmptyCTA
            action={
              <Button
                icon={Plus}
                label="Create group"
                onClick={openCreateDialog}
              />
            }
            message="You don’t have any groups yet."
          />
        ))}
      <GroupDialog
        owner={owner}
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        groupId={editedGroupId}
      />
    </div>
  );
}
