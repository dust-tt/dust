import { PROVISIONED_GROUP_TOOLTIP } from "@app/components/groups/GroupKinds";
import { GroupManagersField } from "@app/components/groups/GroupManagersField";
import type {
  MemberRowData,
  SearchMemberType,
} from "@app/components/members/MemberSelectionTable";
import { useGroup, useUpdateGroup } from "@app/lib/swr/groups";
import type { GroupWithAllowedActions } from "@app/types/api/groups";
import type { LightUserType, LightWorkspaceType } from "@app/types/user";
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
import { Trans, useLingui } from "@lingui/react/macro";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 25;

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
  members: LightUserType[];
  managers: LightUserType[];
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [initialManagers] = useState(managers);
  const [selectedManagers, setSelectedManagers] =
    useState<SearchMemberType[]>(initialManagers);
  const { doUpdateGroup, isUpdating } = useUpdateGroup({
    owner,
    groupId: group.sId,
  });
  const columns = useMemo<ColumnDef<MemberRowData>[]>(
    () => [
      {
        id: "fullName",
        accessorKey: "fullName",
        header: t`Name`,
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
                    <span className="text-xs text-muted-foreground">
                      {email}
                    </span>
                  )}
                </div>
              </div>
            </DataTable.CellContent>
          );
        },
      },
    ],
    [t]
  );
  const rows: MemberRowData[] = useMemo(
    () =>
      members.map((member) => ({
        sId: member.sId,
        fullName: member.fullName,
        email: member.email,
        image: member.image ?? "",
      })),
    [members]
  );

  const memberCount = rows.length;

  const saveManagers = async () => {
    const initialIds = new Set(initialManagers.map((manager) => manager.sId));
    const selectedIds = new Set(selectedManagers.map((manager) => manager.sId));
    const result = await doUpdateGroup({
      managerDiff: {
        add: [...selectedIds].filter((id) => !initialIds.has(id)),
        remove: [...initialIds].filter((id) => !selectedIds.has(id)),
      },
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
            {t(PROVISIONED_GROUP_TOOLTIP)}
          </p>
          <h3 className="text-sm font-semibold">
            <Trans>Group members ({memberCount})</Trans>
          </h3>
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
              <Trans>This group has no members.</Trans>
            </div>
          )}
          {group.allowedActions?.canAssignManagers && (
            <GroupManagersField
              owner={owner}
              group={group}
              managers={selectedManagers}
              groupMemberIds={new Set(members.map((member) => member.sId))}
              onChange={setSelectedManagers}
              disabled={isUpdating}
            />
          )}
        </div>
      </DialogContainer>
      {group.allowedActions?.canAssignManagers && (
        <DialogFooter
          leftButtonProps={{ label: t`Cancel`, variant: "ghost" }}
          rightButtonProps={{
            label: t`Save`,
            variant: "primary",
            onClick: saveManagers,
            isLoading: isUpdating,
          }}
        />
      )}
    </>
  );
}
