import {
  Avatar,
  Button,
  Check,
  Chip,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyCTA,
  EmptyCTAButton,
  SearchInput,
  Separator,
  SliderToggle,
  Trash01,
  Users01,
  XClose,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { getUserById, type PodGroup } from "../data";
import type { Space } from "../data/types";
import { DataTable } from "./DataTableDnd";
import { formatDate, type PodSettingsMember } from "./podSettingsShared";

function groupKindChip(kind: PodGroup["kind"]): {
  label: string;
  color: NonNullable<React.ComponentProps<typeof Chip>["color"]>;
} {
  return kind === "provisioned"
    ? { label: "Provisioned", color: "success" }
    : { label: "Manual", color: "info" };
}

export interface PodSettingsParticipantsTabProps {
  space: Space;
  members: PodSettingsMember[];
  isPublic: boolean;
  onIsPublicChange: (isPublic: boolean) => void;
  editorIds: string[];
  onEditorIdsChange: (editorIds: string[]) => void;
  groups: PodGroup[];
  onGroupsChange: (groups: PodGroup[]) => void;
  onUpdateSpacePublic?: (spaceId: string, isPublic: boolean) => void;
  onInviteMembers?: () => void;
}

export function PodSettingsParticipantsTab({
  space,
  members,
  isPublic,
  onIsPublicChange,
  editorIds,
  onEditorIdsChange,
  groups,
  onGroupsChange,
  onUpdateSpacePublic,
  onInviteMembers,
}: PodSettingsParticipantsTabProps) {
  const [pendingPublicValue, setPendingPublicValue] = useState<boolean | null>(
    null
  );
  const [membersSearchText, setMembersSearchText] = useState("");
  const [memberIdToRemove, setMemberIdToRemove] = useState<string | null>(null);
  const [groupToRemove, setGroupToRemove] = useState<PodGroup | null>(null);

  const toggleMemberEditor = (userId: string) => {
    onEditorIdsChange(
      editorIds.includes(userId)
        ? editorIds.filter((id) => id !== userId)
        : [...editorIds, userId]
    );
  };

  const memberColumns: ColumnDef<PodSettingsMember>[] = useMemo(
    () => [
      {
        accessorKey: "userId",
        header: "Name",
        id: "name",
        sortingFn: "text",
        meta: {
          className: "w-full",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) {
            return <DataTable.BasicCellContent label="Unknown" />;
          }
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="xs"
                  isRounded={true}
                />
                <span className="text-sm">{user.fullName}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "userId",
        header: "Email",
        id: "email",
        meta: {
          className: "w-[200px]",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) {
            return <DataTable.BasicCellContent label="Unknown" />;
          }
          return <DataTable.BasicCellContent label={user.email} />;
        },
      },
      {
        accessorKey: "userId",
        header: "Role",
        id: "role",
        meta: {
          className: "w-[120px]",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          return editorIds.includes(userId) ? (
            <DataTable.CellContent>
              <Chip size="xs" color="success" label="Editor" />
            </DataTable.CellContent>
          ) : (
            <DataTable.BasicCellContent label="" />
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
        cell: (info) => {
          const date = info.getValue() as Date;
          return <DataTable.BasicCellContent label={formatDate(date)} />;
        },
      },
      {
        id: "actions",
        header: "",
        meta: {
          className: "w-12",
        },
        cell: (info) => (
          <DataTable.MoreButton
            menuItems={[
              {
                kind: "item",
                icon: editorIds.includes(info.row.original.userId)
                  ? XClose
                  : Check,
                label: editorIds.includes(info.row.original.userId)
                  ? "Remove from editors"
                  : "Set as editor",
                onClick: () => {
                  toggleMemberEditor(info.row.original.userId);
                },
              },
              {
                kind: "item",
                label: "Remove from Pod",
                icon: Trash01,
                variant: "warning",
                onClick: () => {
                  setMemberIdToRemove(info.row.original.userId);
                },
              },
            ]}
          />
        ),
      },
    ],
    [editorIds]
  );

  const groupColumns: ColumnDef<PodGroup>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Group name",
        id: "name",
        sortingFn: "text",
        meta: { className: "w-[250px]" },
        cell: (info) => (
          // The playground's DataTable fork does not space the cell icon.
          <DataTable.CellContent
            icon={Users01}
            iconClassName="mr-2 text-foreground"
          >
            {info.row.original.name}
          </DataTable.CellContent>
        ),
      },
      {
        id: "kind",
        header: "Group type",
        meta: { className: "w-[250px]" },
        cell: (info) => {
          const { label, color } = groupKindChip(info.row.original.kind);
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
        cell: (info) => (
          <DataTable.CellContent>
            {info.row.original.role === "editor" && (
              <Chip size="xs" color="success" label="Editor" />
            )}
          </DataTable.CellContent>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { className: "w-12" },
        cell: (info) => (
          <DataTable.MoreButton
            menuItems={[
              {
                kind: "item",
                label: "Remove from Pod",
                icon: Trash01,
                variant: "warning",
                onClick: () => setGroupToRemove(info.row.original),
              },
            ]}
          />
        ),
      },
    ],
    []
  );

  const filteredMembers = useMemo(() => {
    if (!membersSearchText.trim()) {
      return members;
    }
    const searchLower = membersSearchText.toLowerCase();
    return members.filter((member) => {
      const user = getUserById(member.userId);
      if (!user) {
        return false;
      }
      return (
        user.fullName.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)
      );
    });
  }, [members, membersSearchText]);

  return (
    <>
      {/* Visibility */}
      <div className="flex w-full items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="heading-lg">Open to everyone</div>
          <div className="text-sm text-muted-foreground">
            Anyone in the workspace can find and join the Pod.
          </div>
        </div>
        <SliderToggle
          selected={isPublic}
          onClick={() => setPendingPublicValue(!isPublic)}
        />
      </div>

      <Separator />

      {/* Individual members */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="heading-lg flex-1">Individual members</h3>
          <Button
            label="Manage"
            variant="outline"
            icon={Users01}
            onClick={() => onInviteMembers?.()}
          />
        </div>
        {members.length === 0 ? (
          <EmptyCTA
            message="Feeling lonely? Invite participants!"
            action={
              <EmptyCTAButton
                icon={Users01}
                label="Invite"
                onClick={() => onInviteMembers?.()}
              />
            }
          />
        ) : (
          <>
            <SearchInput
              name="members-search"
              value={membersSearchText}
              onChange={setMembersSearchText}
              placeholder="Search (email)"
              className="w-full"
            />
            <DataTable
              columns={memberColumns}
              data={filteredMembers}
              sorting={[{ id: "name", desc: false }]}
            />
          </>
        )}
      </div>

      {/* The Pod's members are the individual list above plus the members of these groups. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="heading-lg flex-1">Group members</h3>
          <Button label="Manage" variant="outline" icon={Users01} />
        </div>
        {groups.length > 0 && (
          <DataTable
            columns={groupColumns}
            data={groups}
            className="relative w-full"
            sorting={[{ id: "name", desc: false }]}
          />
        )}
      </div>

      {/* Visibility confirmation */}
      <Dialog
        open={pendingPublicValue !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setPendingPublicValue(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {pendingPublicValue === true
                ? "Switch to open?"
                : "Switch to restricted?"}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {pendingPublicValue === true
              ? "All workspace members will be able to join and see everything in the Pod — including existing conversations and files."
              : "Access will be limited to invited members only."}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setPendingPublicValue(null),
            }}
            rightButtonProps={{
              label: "Confirm",
              variant: "warning",
              onClick: () => {
                if (pendingPublicValue !== null) {
                  onIsPublicChange(pendingPublicValue);
                  onUpdateSpacePublic?.(space.id, pendingPublicValue);
                }
                setPendingPublicValue(null);
              },
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Remove member */}
      <Dialog
        open={memberIdToRemove !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setMemberIdToRemove(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {memberIdToRemove && (
              <div>
                {`Are you sure you want to remove "${
                  getUserById(memberIdToRemove)?.fullName ?? "this member"
                }" from this Pod?`}
              </div>
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setMemberIdToRemove(null),
            }}
            rightButtonProps={{
              label: "Remove",
              variant: "warning",
              onClick: () => setMemberIdToRemove(null),
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Remove group */}
      <Dialog
        open={groupToRemove !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setGroupToRemove(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Remove group</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {groupToRemove && (
              <div>
                {`Are you sure you want to remove "${groupToRemove.name}" from this Pod? Its members will lose access, unless they are members of the Pod some other way.`}
              </div>
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setGroupToRemove(null),
            }}
            rightButtonProps={{
              label: "Remove",
              variant: "warning",
              onClick: () => {
                if (groupToRemove) {
                  onGroupsChange(
                    groups.filter((group) => group.id !== groupToRemove.id)
                  );
                }
                setGroupToRemove(null);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
