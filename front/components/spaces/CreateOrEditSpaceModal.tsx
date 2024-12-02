import {
  Button,
  DataTable,
  ExclamationCircleStrokeIcon,
  Icon,
  Input,
  Modal,
  Page,
  ScrollArea,
  SliderToggle,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType, SpaceType, UserType } from "@dust-tt/types";
import type {
  CellContext,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmDeleteSpaceDialog } from "@app/components/spaces/ConfirmDeleteSpaceDialog";
import { SearchMembersPopover } from "@app/components/spaces/SearchMembersPopover";
import {
  useCreateSpace,
  useDeleteSpace,
  useSpaceInfo,
  useUpdateSpace,
} from "@app/lib/swr/spaces";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  email: string;
  onClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

function getTableRows(allUsers: UserType[]): RowData[] {
  return allUsers.map((user) => ({
    icon: user.image ?? "",
    name: user.fullName,
    userId: user.sId,
    email: user.email ?? "",
  }));
}

interface CreateOrEditSpaceModalProps {
  defaultRestricted?: boolean;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (space: SpaceType) => void;
  owner: LightWorkspaceType;
  space?: SpaceType;
}

export function CreateOrEditSpaceModal({
  defaultRestricted,
  isAdmin,
  isOpen,
  onClose,
  onCreated,
  owner,
  space,
}: CreateOrEditSpaceModalProps) {
  const [spaceName, setSpaceName] = useState<string | null>(
    space?.name ?? null
  );
  const [selectedMembers, setSelectedMembers] = useState<UserType[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);

  const doCreate = useCreateSpace({ owner });
  const doUpdate = useUpdateSpace({ owner });
  const doDelete = useDeleteSpace({ owner });

  const router = useRouter();

  const { spaceInfo, mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space?.sId ?? null,
  });

  useEffect(() => {
    if (isOpen) {
      const spaceMembers = spaceInfo?.members ?? null;

      if (spaceMembers && spaceInfo?.isRestricted) {
        setSelectedMembers(spaceMembers);
      }

      setSpaceName(spaceInfo?.name ?? null);

      setIsRestricted(
        spaceInfo ? spaceInfo.isRestricted : defaultRestricted ?? false
      );
    }
  }, [defaultRestricted, isOpen, spaceInfo]);

  const handleClose = useCallback(() => {
    // Call the original onClose function.
    onClose();

    setTimeout(() => {
      // Reset state.
      setSpaceName("");
      setIsRestricted(false);
      setSelectedMembers([]);
      setShowDeleteConfirmDialog(false);
      setIsDeleting(false);
      setIsSaving(false);
    }, 500);
  }, [onClose]);

  const onSave = useCallback(async () => {
    setIsSaving(true);

    if (space) {
      if (isRestricted) {
        await doUpdate(space, {
          isRestricted: true,
          memberIds: selectedMembers.map((vm) => vm.sId),
          name: spaceName,
        });
      } else {
        await doUpdate(space, {
          isRestricted: false,
          memberIds: null,
          name: spaceName,
        });
      }

      // FIXME: we should update the page space's name as well.
      await mutateSpaceInfo();
    } else if (!space) {
      let createdSpace;

      if (isRestricted) {
        createdSpace = await doCreate({
          name: spaceName,
          isRestricted: true,
          memberIds: selectedMembers.map((vm) => vm.sId),
        });
      } else {
        createdSpace = await doCreate({
          name: spaceName,
          isRestricted: false,
          memberIds: null, // must be null when isRestricted is false
        });
      }

      setIsSaving(false);
      if (createdSpace && onCreated) {
        onCreated(createdSpace);
      }
    }

    handleClose();
  }, [
    doCreate,
    doUpdate,
    handleClose,
    isRestricted,
    mutateSpaceInfo,
    onCreated,
    selectedMembers,
    space,
    spaceName,
  ]);

  const onDelete = useCallback(async () => {
    if (!space) {
      setShowDeleteConfirmDialog(false);
      return;
    }

    setIsDeleting(true);

    const res = await doDelete(space);
    setIsDeleting(false);
    setShowDeleteConfirmDialog(false);

    if (res) {
      handleClose();
      await router.push(`/w/${owner.sId}/spaces`);
    }
  }, [doDelete, handleClose, owner.sId, router, space]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={space ? `Edit ${space.name}` : "Create a Space"}
      saveLabel={space ? "Save" : "Create"}
      variant="side-md"
      hasChanged={
        !!spaceName &&
        (!isRestricted || (isRestricted && selectedMembers.length > 0))
      }
      isSaving={isSaving}
      className="flex overflow-visible" // overflow-visible is needed to avoid clipping the delete button
      onSave={onSave}
    >
      <Page.Vertical gap="md" sizing="grow">
        <div className="flex w-full flex-col gap-y-4 overflow-y-hidden px-1">
          <div className="mb-4 flex w-full flex-col gap-y-2 pt-2">
            <Page.SectionHeader title="Name" />
            <Input
              placeholder="Space's name"
              value={spaceName}
              name="spaceName"
              onChange={(e) => setSpaceName(e.target.value)}
            />
            {!space && (
              <div className="flex gap-1 text-xs text-element-700">
                <Icon visual={ExclamationCircleStrokeIcon} size="xs" />
                <span>Space name must be unique</span>
              </div>
            )}
          </div>
          <div className="flex w-full flex-col gap-y-2 border-t pt-2">
            <div className="flex w-full items-center justify-between overflow-visible">
              <Page.SectionHeader title="Restricted Access" />
              <SliderToggle
                selected={isRestricted}
                onClick={() => setIsRestricted(!isRestricted)}
              />
            </div>
            <div className="text-sm font-normal text-element-700">
              {isRestricted ? (
                <p>Restricted access is active.</p>
              ) : (
                <p>
                  Restricted access is disabled. The space is accessible to
                  everyone in the workspace.
                </p>
              )}
            </div>
          </div>
          {isRestricted && (
            <>
              <SearchMembersPopover
                owner={owner}
                selectedMembers={selectedMembers}
                onMembersUpdated={setSelectedMembers}
              />
              <ScrollArea className="h-full">
                <MembersTable
                  onMembersUpdated={setSelectedMembers}
                  selectedMembers={selectedMembers}
                />
              </ScrollArea>
            </>
          )}
          {isAdmin && space && space.kind === "regular" && (
            <>
              <ConfirmDeleteSpaceDialog
                space={space}
                handleDelete={onDelete}
                isOpen={showDeleteConfirmDialog}
                isDeleting={isDeleting}
                onClose={() => setShowDeleteConfirmDialog(false)}
              />
              <div className="flex w-full justify-end">
                <Button
                  size="sm"
                  label="Delete Space"
                  variant="warning"
                  className="mr-2"
                  onClick={() => setShowDeleteConfirmDialog(true)}
                />
              </div>
            </>
          )}
        </div>
      </Page.Vertical>
    </Modal>
  );
}

interface MembersTableProps {
  onMembersUpdated: (members: UserType[]) => void;
  selectedMembers: UserType[];
}

function MembersTable({
  onMembersUpdated,
  selectedMembers,
}: MembersTableProps) {
  const sendNotifications = useSendNotification();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "email", desc: false },
  ]);

  const getTableColumns = useCallback(() => {
    const removeMember = (userId: string) => {
      if (selectedMembers.length === 1) {
        sendNotifications({
          title: "Cannot remove last member.",
          description: "You cannot remove the last group member.",
          type: "error",
        });
        return;
      }
      onMembersUpdated(selectedMembers.filter((m) => m.sId !== userId));
    };
    return [
      {
        id: "name",
        accessorKey: "name",
        cell: (info: Info) => (
          <>
            <DataTable.CellContent
              avatarUrl={info.row.original.icon}
              className="hidden md:flex"
            >
              {info.row.original.name}
            </DataTable.CellContent>
            <DataTable.CellContent
              avatarUrl={info.row.original.icon}
              className="flex md:hidden"
              description={info.row.original.email}
            >
              {info.row.original.name}
            </DataTable.CellContent>
          </>
        ),
        enableSorting: true,
      },
      {
        id: "email",
        accessorKey: "email",
        cell: (info: Info) => (
          <DataTable.CellContent>
            <span className="text-element-700">{info.row.original.email}</span>
          </DataTable.CellContent>
        ),
        enableSorting: true,
      },
      {
        id: "action",
        cell: (info: Info) => {
          return (
            <div className="flex w-full justify-end">
              <Button
                icon={XMarkIcon}
                variant="ghost"
                onClick={() => removeMember(info.row.original.userId)}
              />
            </div>
          );
        },
      },
    ];
  }, [onMembersUpdated, selectedMembers, sendNotifications]);

  const rows = useMemo(() => getTableRows(selectedMembers), [selectedMembers]);
  const columns = useMemo(() => getTableColumns(), [getTableColumns]);

  return (
    <DataTable
      data={rows}
      columns={columns}
      columnsBreakpoints={{
        email: "md",
      }}
      pagination={pagination}
      setPagination={setPagination}
      sorting={sorting}
      setSorting={setSorting}
      totalRowCount={rows.length}
    />
  );
}
