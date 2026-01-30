import { Avatar, Checkbox, DataTable, TrashIcon } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useContext, useMemo } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSpaceInfo, useUpdateSpace } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType, SpaceUserType } from "@app/types";

interface MembersTableProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  onMembersUpdated: (members: SpaceUserType[]) => void;
  selectedMembers: SpaceUserType[];
  searchSelectedMembers: string;
  isEditor?: boolean;
}

type MemberRowData = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string;
  isEditor: boolean;
  joinedAt: string;
  onClick?: () => void;
};

function getMemberTableRows(allUsers: SpaceUserType[]): MemberRowData[] {
  return allUsers.map((user) => ({
    userId: user.sId,
    name: user.fullName,
    email: user.email ?? "",
    avatarUrl: user.image ?? "",
    isEditor: user.isEditor ?? false,
    joinedAt: user.joinedAt ?? "",
  }));
}

export function MembersTable({
  owner,
  space,
  onMembersUpdated,
  selectedMembers,
  searchSelectedMembers,
  isEditor,
}: MembersTableProps) {
  const sendNotifications = useSendNotification();

  const doUpdate = useUpdateSpace({ owner });
  const { mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const confirm = useContext(ConfirmContext);

  const removeMember = useCallback(
    async (userId: string) => {
      const updatedMembers = selectedMembers.filter((m) => m.sId !== userId);
      if (!updatedMembers.some((m) => m.isEditor)) {
        sendNotifications({
          title: "Projects must have at least one editor.",
          description: "You cannot remove the last editor.",
          type: "error",
        });
        return;
      }

      const updateMember = await doUpdate(space, {
        isRestricted: space.isRestricted,
        memberIds: updatedMembers
          .filter((m) => !m.isEditor)
          .map((member) => member.sId),
        editorIds: updatedMembers.filter((m) => m.isEditor).map((m) => m.sId),
        managementMode: "manual",
        name: space.name,
      });
      if (updateMember) {
        await mutateSpaceInfo();
      }
    },
    [doUpdate, space, selectedMembers, sendNotifications, mutateSpaceInfo]
  );

  const toggleEditor = (userId: string) => {
    if (!isEditor) {
      return;
    }
    const toggledMember = selectedMembers.find((m) => m.sId === userId);
    if (!toggledMember) {
      return;
    }

    onMembersUpdated([
      ...selectedMembers.slice(0, selectedMembers.indexOf(toggledMember)),
      {
        ...toggledMember,
        isEditor: !toggledMember.isEditor,
      },
      ...selectedMembers.slice(selectedMembers.indexOf(toggledMember) + 1),
    ]);
  };

  const columns: ColumnDef<MemberRowData>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        id: "name",
        sortingFn: "text",
        meta: {
          className: "w-full",
        },
        cell: (info) => {
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                <Avatar
                  name={info.row.original.name}
                  visual={info.row.original.avatarUrl}
                  size="xs"
                  isRounded={true}
                />
                <span className="text-sm">{info.row.original.name}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "email",
        header: "Email",
        id: "email",
        meta: {
          className: "w-[250px]",
        },
        cell: (info) => {
          return <DataTable.BasicCellContent label={info.row.original.email} />;
        },
      },
      ...(isEditor
        ? [
            {
              id: "editor",
              header: "Editor",
              meta: {
                className: "w-20",
              },
              cell: (info: any) => {
                return (
                  <DataTable.CellContent>
                    <Checkbox
                      checked={info.row.original.isEditor}
                      onCheckedChange={() =>
                        toggleEditor(info.row.original.userId)
                      }
                      disabled={!isEditor}
                    />
                  </DataTable.CellContent>
                );
              },
            },
          ]
        : []),
      {
        accessorKey: "joinedAt",
        header: "Joined at",
        id: "joinedAt",
        meta: {
          className: "w-[140px]",
        },
        cell: (info) => {
          const date = new Date(info.row.original.joinedAt);
          return (
            <DataTable.BasicCellContent
              label={
                date?.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                }) ?? ""
              }
            />
          );
        },
      },
      ...(isEditor
        ? [
            {
              id: "actions",
              header: "",
              meta: {
                className: "w-12",
              },
              cell: (info: any) => (
                <DataTable.MoreButton
                  menuItems={[
                    {
                      kind: "item",
                      label: "Remove from project",
                      icon: TrashIcon,
                      variant: "warning",
                      onClick: async () => {
                        const confirmed = await confirm({
                          title: "Remove member",
                          message: `Are you sure you want to remove "${info.row.original.name}" from this project?`,
                          validateLabel: "Remove",
                          validateVariant: "warning",
                        });

                        if (confirmed) {
                          await removeMember(info.row.original.userId);
                        }
                      },
                    },
                  ]}
                />
              ),
            },
          ]
        : []),
    ],
    [isEditor, removeMember, toggleEditor, confirm]
  );

  const rows = useMemo(
    () => getMemberTableRows(selectedMembers),
    [selectedMembers]
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      filter={searchSelectedMembers}
      filterColumn="email"
      sorting={[{ id: "name", desc: false }]}
    />
  );
}
