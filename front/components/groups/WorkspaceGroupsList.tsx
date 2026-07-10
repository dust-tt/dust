import { CreateGroupDialog } from "@app/components/groups/CreateGroupDialog";
import { useGroups } from "@app/lib/swr/groups";
import type { GroupKind } from "@app/types/groups";
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

// Only provisioned groups are surfaced in the workspace Groups tab for now.
const GROUP_KINDS: GroupKind[] = ["provisioned"];

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
    kinds: GROUP_KINDS,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const rows = useMemo<GroupRowData[]>(() => {
    return groups.map((group) => ({
      groupId: group.sId,
      name: group.name,
      memberCount: group.memberCount,
      kind: group.kind,
    }));
  }, [groups]);

  return (
    <div className="flex flex-col gap-4">
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
          onClick={() => setIsCreateDialogOpen(true)}
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
            action={<Button icon={Plus} label="Create group" onClick={() => setIsCreateDialogOpen(true)} />}
            message="You don’t have any groups yet."
          />
        ))}
      <CreateGroupDialog
        owner={owner}
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}
