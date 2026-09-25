import { PROVISIONED_GROUP_TOOLTIP } from "@app/components/groups/GroupKinds";
import { GroupManagersField } from "@app/components/groups/GroupManagersField";
import type {
  MemberRowData,
  SearchMemberType,
} from "@app/components/members/MemberSelectionTable";
import { useGroup, useUpdateGroup } from "@app/lib/swr/groups";
import type { GroupWithAllowedActions } from "@app/types/api/groups";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Avatar,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useState } from "react";

const DEFAULT_PAGE_SIZE = 25;

const columns: ColumnDef<MemberRowData>[] = [
  {
    id: "fullName",
    accessorKey: "fullName",
    header: "Name",
    sortingFn: "text",
    meta: { className: "w-full" },
    cell: ({ row }) => {
      const { fullName, email, image } = row.original;
      return (
        <DataTable.CellContent>
          <div className="flex items-center gap-2">
            <Avatar
              name={fullName}
              visual={image || undefined}
              size="xs"
              isRounded
            />
            <div className="flex flex-col">
              <span className="text-sm">{fullName}</span>
              {email && (
                <span className="text-xs text-muted-foreground">{email}</span>
              )}
            </div>
          </div>
        </DataTable.CellContent>
      );
    },
  },
];

interface ProvisionedGroupDialogProps {
  owner: LightWorkspaceType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string | null;
  groupName: string;
}

/**
 * Read-only view of a provisioned group: membership is owned by the identity provider, so members
 * are only listed, never edited.
 */
export function ProvisionedGroupDialog({
  owner,
  isOpen,
  onOpenChange,
  groupId,
  groupName,
}: ProvisionedGroupDialogProps) {
  const { group, members, managers, isGroupLoading } = useGroup({
    owner,
    groupId,
    disabled: !isOpen,
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle>{groupName}</DialogTitle>
        </DialogHeader>
        {isGroupLoading || !group ? (
          <DialogContainer>
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          </DialogContainer>
        ) : (
          <ProvisionedGroupDetails
            key={groupId}
            owner={owner}
            group={group}
            members={members}
            managers={managers}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProvisionedGroupDetails({
  owner,
  group,
  members,
  managers,
  onClose,
}: {
  owner: LightWorkspaceType;
  group: GroupWithAllowedActions;
  members: UserType[];
  managers: UserType[];
  onClose: () => void;
}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [selectedManagers, setSelectedManagers] =
    useState<SearchMemberType[]>(managers);
  const { doUpdateGroup, isUpdating } = useUpdateGroup({
    owner,
    groupId: group.sId,
  });
  const rows: MemberRowData[] = members.map((member) => ({
    sId: member.sId,
    fullName: member.fullName,
    email: member.email,
    image: member.image ?? "",
  }));

  const saveManagers = async () => {
    const result = await doUpdateGroup({
      managerIds: selectedManagers.map((manager) => manager.sId),
    });
    if (result) {
      onClose();
    }
  };

  return (
    <>
      <DialogContainer>
        <div className="flex flex-col gap-4">
          <p className="text-sm italic text-muted-foreground">
            {PROVISIONED_GROUP_TOOLTIP}
          </p>
          {rows.length > 0 ? (
            <DataTable
              data={rows}
              columns={columns}
              pagination={pagination}
              setPagination={setPagination}
              getRowId={(row) => row.sId}
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              This group has no members.
            </div>
          )}
          {group.allowedActions?.canAssignManagers && (
            <GroupManagersField
              owner={owner}
              group={group}
              managers={selectedManagers}
              onChange={setSelectedManagers}
              disabled={isUpdating}
            />
          )}
        </div>
      </DialogContainer>
      {group.allowedActions?.canAssignManagers && (
        <DialogFooter
          leftButtonProps={{ label: "Cancel", variant: "ghost" }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: saveManagers,
            isLoading: isUpdating,
          }}
        />
      )}
    </>
  );
}
