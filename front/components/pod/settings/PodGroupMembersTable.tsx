import { ConfirmContext } from "@app/components/Confirm";
import { getGroupKindChip } from "@app/components/groups/GroupKinds";
import { spaceMembershipDimensions } from "@app/lib/spaces_utils";
import { useUpdateSpace } from "@app/lib/swr/spaces";
import type {
  RichSpaceType,
  SpaceGroupAccessType,
} from "@app/types/api/spaces";
import type { GroupKind } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import { Chip, DataTable, Trash01, Users01 } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useContext, useMemo } from "react";

interface PodGroupMembersTableProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
  groups: SpaceGroupAccessType[];
  isEditor?: boolean;
  mutatePodInfo: () => Promise<void>;
}

type GroupRowData = {
  groupId: string;
  name: string;
  kind: GroupKind;
  role: SpaceGroupAccessType["role"];
  onClick?: () => void;
};

type GroupRowInfo = { row: { original: GroupRowData } };

export function PodGroupMembersTable({
  owner,
  pod,
  groups,
  isEditor,
  mutatePodInfo,
}: PodGroupMembersTableProps) {
  const doUpdate = useUpdateSpace({ owner });
  const confirm = useContext(ConfirmContext);

  const removeGroup = useCallback(
    async (groupId: string) => {
      const dimensions = spaceMembershipDimensions(pod);

      // Only the group dimensions change; the individual members are passed through.
      const updated = await doUpdate(
        pod,
        {
          isRestricted: pod.isRestricted,
          name: pod.name,
          ...dimensions,
          groupIds: dimensions.groupIds.filter((sId) => sId !== groupId),
          editorGroupIds: dimensions.editorGroupIds.filter(
            (sId) => sId !== groupId
          ),
        },
        {
          title: "Successfully removed group",
          description: "The group no longer has access to this Pod.",
        }
      );
      if (updated) {
        await mutatePodInfo();
      }
    },
    [doUpdate, mutatePodInfo, pod]
  );

  const rows: GroupRowData[] = useMemo(
    () =>
      groups.map((group) => ({
        groupId: group.sId,
        name: group.name,
        kind: group.kind,
        role: group.role,
      })),
    [groups]
  );

  const columns: ColumnDef<GroupRowData>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Group name",
        id: "name",
        sortingFn: "text",
        meta: { className: "w-[250px]" },
        cell: (info: GroupRowInfo) => (
          <DataTable.CellContent icon={Users01}>
            {info.row.original.name}
          </DataTable.CellContent>
        ),
      },
      {
        id: "kind",
        header: "Group type",
        meta: { className: "w-[250px]" },
        cell: (info: GroupRowInfo) => {
          const { label, color } = getGroupKindChip(info.row.original.kind);
          return (
            <DataTable.CellContent>
              <Chip size="xs" color={color} label={label} />
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "role",
        header: "Role",
        meta: { className: "w-20" },
        cell: (info: GroupRowInfo) => (
          <DataTable.CellContent>
            {info.row.original.role === "editor" && (
              <Chip color="success" size="xs" label="Editor" />
            )}
          </DataTable.CellContent>
        ),
      },
      ...(isEditor
        ? [
            {
              id: "actions",
              header: "",
              meta: { className: "w-12" },
              cell: (info: GroupRowInfo) => {
                const { name, groupId } = info.row.original;
                const menuItems: MenuItem[] = [
                  {
                    kind: "item",
                    label: "Remove from Pod",
                    icon: Trash01,
                    variant: "warning",
                    onClick: async () => {
                      const confirmed = await confirm({
                        title: "Remove group",
                        message: `Are you sure you want to remove "${name}" from this Pod? Its members will lose access, unless they are members of the Pod some other way.`,
                        validateLabel: "Remove",
                        validateVariant: "warning",
                      });
                      if (confirmed) {
                        await removeGroup(groupId);
                      }
                    },
                  },
                ];
                return <DataTable.MoreButton menuItems={menuItems} />;
              },
            },
          ]
        : []),
    ],
    [confirm, isEditor, removeGroup]
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      className="relative w-full"
      sorting={[{ id: "name", desc: false }]}
    />
  );
}
