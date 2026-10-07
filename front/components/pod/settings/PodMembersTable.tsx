import { ConfirmContext } from "@app/components/Confirm";
import { useSendNotification } from "@app/hooks/useNotification";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatDate } from "@app/lib/i18n/format";
import { spaceMembershipProperties } from "@app/lib/spaces_utils";
import { useUpdateSpace } from "@app/lib/swr/spaces";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Avatar,
  Check,
  Chip,
  DataTable,
  Trash01,
  XClose,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useContext, useMemo } from "react";

interface PodMembersTableProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
  selectedMembers: SpaceUserType[];
  searchSelectedMembers: string;
  isEditor?: boolean;
  mutatePodInfo: () => Promise<void>;
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

export function PodMembersTable({
  owner,
  pod,
  selectedMembers,
  searchSelectedMembers,
  isEditor,
  mutatePodInfo,
}: PodMembersTableProps) {
  const { t } = useLingui();
  const sendNotifications = useSendNotification();

  const doUpdate = useUpdateSpace({ owner });
  const confirm = useContext(ConfirmContext);

  const removeMember = useCallback(
    async (userId: string) => {
      const updatedMembers = selectedMembers.filter((m) => m.sId !== userId);
      // The individual editor list must not be emptied, even when a group is attached to the Pod
      // as an editor: a group's membership can drop to zero — in its IdP, for a provisioned one —
      // leaving the Pod with nobody able to administrate it.
      if (
        selectedMembers.some((m) => m.isEditor) &&
        !updatedMembers.some((m) => m.isEditor)
      ) {
        sendNotifications({
          title: t`Pods must have at least one editor.`,
          description: t`You cannot remove the last editor.`,
          type: "error",
        });
        return;
      }

      const updateMember = await doUpdate(
        pod,
        {
          isRestricted: pod.isRestricted,
          ...spaceMembershipProperties(pod),
          memberIds: updatedMembers
            .filter((member) => !member.isEditor)
            .map((member) => member.sId),
          editorIds: updatedMembers.filter((m) => m.isEditor).map((m) => m.sId),
          name: pod.name,
        },
        {
          title: t`Successfully removed member`,
          description: t`Pod member was successfully removed.`,
        }
      );
      if (updateMember) {
        await mutatePodInfo();
      }
    },
    [doUpdate, pod, selectedMembers, sendNotifications, mutatePodInfo, t]
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
          title: t`Pods must have at least one editor.`,
          description: t`You cannot remove the last editor.`,
          type: "error",
        });
        return;
      }

      const updateMember = await doUpdate(
        pod,
        {
          isRestricted: pod.isRestricted,
          ...spaceMembershipProperties(pod),
          memberIds: updatedMembers
            .filter((member) => !member.isEditor)
            .map((member) => member.sId),
          editorIds: updatedMembers
            .filter((member) => member.isEditor)
            .map((member) => member.sId),
          name: pod.name,
        },
        {
          title: newIsEditorValue
            ? t`Successfully added editor`
            : t`Successfully removed editor`,
          description: newIsEditorValue
            ? t`Pod editor was successfully added.`
            : t`Pod editor was successfully removed.`,
        }
      );
      if (updateMember) {
        await mutatePodInfo();
      }
    },
    [doUpdate, mutatePodInfo, pod, selectedMembers, sendNotifications, t]
  );

  const rows = useMemo(
    () => getMemberTableRows(selectedMembers),
    [selectedMembers]
  );

  const columns: ColumnDef<MemberRowData>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: t`Name`,
        id: "name",
        sortingFn: "text",
        meta: {
          className: "w-[250px]",
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
        header: t`Email`,
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
        header: t`Role`,
        meta: {
          className: "w-20",
        },
        cell: (info: MemberRowInfo) => {
          return (
            <DataTable.CellContent>
              {info.row.original.isEditor && (
                <Chip color="success" size="xs" label={t`Editor`} />
              )}
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "joinedAt",
        header: t`Joined at`,
        id: "joinedAt",
        meta: {
          className: "w-[140px]",
        },
        cell: (info: MemberRowInfo) => {
          const date = new Date(info.row.original.joinedAt);
          return (
            <DataTable.BasicCellContent
              label={formatDate(
                date,
                {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                },
                getActiveLocale()
              )}
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
                const memberName = info.row.original.name;
                const menuItems: MenuItem[] = [];
                let editorSettingItem: MenuItem;
                if (info.row.original.isEditor) {
                  const editorLabel = t`Remove from editors`;
                  editorSettingItem = {
                    kind: "item",
                    label: editorLabel,
                    disabled: rows.filter((row) => row.isEditor).length <= 1,
                    icon: XClose,
                    variant: "default",
                    onClick: async () => {
                      const confirmed = await confirm({
                        title: editorLabel,
                        message: t`Are you sure you want to remove "${memberName}" from editors?`,
                        validateLabel: t`Remove`,
                        validateVariant: "primary",
                      });

                      if (confirmed) {
                        await toggleEditor(info.row.original.userId);
                      }
                    },
                  };
                } else {
                  const editorLabel = t`Set as editor`;
                  editorSettingItem = {
                    kind: "item",
                    label: editorLabel,
                    icon: Check,
                    variant: "default",
                    onClick: async () => {
                      const confirmed = await confirm({
                        title: editorLabel,
                        message: t`Are you sure you want to add "${memberName}" as an editor?`,
                        validateLabel: t`Add`,
                        validateVariant: "primary",
                      });

                      if (confirmed) {
                        await toggleEditor(info.row.original.userId);
                      }
                    },
                  };
                }
                menuItems.push(editorSettingItem);

                menuItems.push({
                  kind: "item",
                  label: t`Remove from Pod`,
                  icon: Trash01,
                  variant: "warning",
                  onClick: async () => {
                    const confirmed = await confirm({
                      title: t`Remove member`,
                      message: t`Are you sure you want to remove "${memberName}" from this Pod?`,
                      validateLabel: t`Remove`,
                      validateVariant: "warning",
                    });

                    if (confirmed) {
                      await removeMember(info.row.original.userId);
                    }
                  },
                });
                return <DataTable.MoreButton menuItems={menuItems} />;
              },
            },
          ]
        : []),
    ],
    [isEditor, removeMember, confirm, toggleEditor, rows, t]
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      filter={searchSelectedMembers}
      filterColumn="email"
      sorting={[{ id: "name", desc: false }]}
      columnsBreakpoints={{
        email: "sm",
        joinedAt: "sm",
      }}
    />
  );
}
