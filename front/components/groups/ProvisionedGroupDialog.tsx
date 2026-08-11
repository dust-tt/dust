import { PROVISIONED_GROUP_TOOLTIP } from "@app/components/groups/GroupKinds";
import type { MemberRowData } from "@app/components/members/MemberSelectionTable";
import { useGroup } from "@app/lib/swr/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
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
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const { members, isGroupLoading } = useGroup({
    owner,
    groupId,
    disabled: !isOpen,
  });

  const rows: MemberRowData[] = members.map((member) => ({
    sId: member.sId,
    fullName: member.fullName,
    email: member.email,
    image: member.image ?? "",
  }));

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="xl" height="lg">
        <DialogHeader>
          <DialogTitle>{groupName}</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <p className="text-sm italic text-muted-foreground">
              {PROVISIONED_GROUP_TOOLTIP}
            </p>
            {isGroupLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : rows.length > 0 ? (
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
          </div>
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
}
