import { ConfirmContext } from "@app/components/Confirm";
import { useSendNotification } from "@app/hooks/useNotification";
import { useUpdateSpace } from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Avatar,
  CheckIcon,
  Chip,
  DataTable,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useContext, useMemo } from "react";

interface MembersTableProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  selectedMembers: SpaceUserType[];
  searchSelectedMembers: string;
  isEditor?: boolean;
  mutateSpaceInfo: () => Promise<void>;
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

type MemberRowInfo = { row: { original: MemberRowData } };

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
  selectedMembers,
  searchSelectedMembers,
  isEditor,
  mutateSpaceInfo,
}: MembersTableProps) {
  const sendNotifications = useSendNotification();

  const doUpdate = useUpdateSpace({ owner });
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

      const updateMember = await doUpdate(
        space,
        {
          isRestricted: space.isRestricted,
          memberIds: updatedMembers
            .filter((member) => !member.isEditor)
            .map((member) => member.sId),
          editorIds: updatedMembers.filter((m) => m.isEditor).map((m) => m.sId),
          managementMode: "manual",
          name: space.name,
        },
        {
          title: "Successfully removed member",
          description: "Project member was successfully removed.",
        }
      );
      if (updateMember) {
        await mutateSpaceInfo();
      }
    },
    [doUpdate, space, selectedMembers, sendNotifications, mutateSpaceInfo]
  );

  const toggleEditor = useCallback(
    async (userId: string) => {
      const toggledMember = selectedMembers.find((m) => m.sId === userId);
      if (!toggledMember) {
        return;
      }
      const toggledMemberIndex = selectedMembers.indexOf(toggledMember);
      const newIsEditorValue = !toggledMember.isEditor;
      const updatedMembers = [
        ...selectedMembers.slice(0, toggledMemberIndex),
        {
          ...selectedMembers[toggledMemberIndex],
          isEditor: newIsEditorValue,
        },
        ...selectedMembers.slice(toggledMemberIndex + 1),
      ];

      if (updatedMembers.filter((m) => m.isEditor).length === 0) {
        sendNotifications({
          title: "Projects must have at least one editor.",
          description: "You cannot remove the last editor.",
          type: "error",
        });
        return;
      }

      const updateMember = await doUpdate(
        space,
        {
          isRestricted: space.isRestricted,
          memberIds: updatedMembers
            .filter((member) => !member.isEditor)
            .map((member) => member.sId),
          editorIds: updatedMembers
            .filter((member) => member.isEditor)
            .map((member) => member.sId),
          managementMode: "manual",
          name: space.name,
        },
        {
          title: newIsEditorValue
            ? "Successfully added editor"
            : "Successfully removed editor",
          description: newIsEditorValue
            ? "Project editor was successfully added."
            : "Project editor was successfully removed.",
        }
      );
      if (updateMember) {
        await mutateSpaceInfo();
      }
    },
    [doUpdate, space, selectedMembers, sendNotifications, mutateSpaceInfo]
  );

  const rows = useMemo(
    () => getMemberTableRows(selectedMembers),
    [selectedMembers]
  );

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
        cell: (info: MemberRowInfo) => {
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
        cell: (info: MemberRowInfo) => {
          return <DataTable.BasicCellContent label={info.row.original.email} />;
        },
      },
      {
        id: "role",
        header: "Role",
        meta: {
          className: "w-20",
        },
        cell: (info: MemberRowInfo) => {
          return (
            <DataTable.CellContent>
              {info.row.original.isEditor && (
                <Chip color="green" size="xs" label="editor" />
              )}
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "joinedAt",
        header: "Joined at",
        id: "joinedAt",
        meta: {
          className: "w-[140px]",
        },
        cell: (info: MemberRowInfo) => {
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
              cell: (info: MemberRowInfo) => {
                let editorSettingItem: MenuItem;
                if (info.row.original.isEditor) {
                  const editorLabel = "Remove from editors";
                  editorSettingItem = {
                    kind: "item",
                    label: editorLabel,
                    disabled: rows.filter((row) => row.isEditor).length <= 1, // disable the "remove" action if it's the last editor
                    icon: XMarkIcon,
                    variant: "default",
                    onClick: async () => {
                      const confirmed = await confirm({
                        title: editorLabel,
                        message: `Are you sure you want to remove "${info.row.original.name}" from editors?`,
                        validateLabel: "Remove",
                        validateVariant: "primary",
                      });

                      if (confirmed) {
                        await toggleEditor(info.row.original.userId);
                      }
                    },
                  };
                } else {
                  const editorLabel = "Set as editor";
                  editorSettingItem = {
                    kind: "item",
                    label: editorLabel,
                    icon: CheckIcon,
                    variant: "default",
                    onClick: async () => {
                      const confirmed = await confirm({
                        title: editorLabel,
                        message: `Are you sure you want to add "${info.row.original.name}" as an editor?`,
                        validateLabel: "Add",
                        validateVariant: "primary",
                      });

                      if (confirmed) {
                        await toggleEditor(info.row.original.userId);
                      }
                    },
                  };
                }
                return (
                  <DataTable.MoreButton
                    menuItems={[
                      editorSettingItem,
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
                );
              },
            },
          ]
        : []),
    ],
    [isEditor, removeMember, confirm, toggleEditor, rows]
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
