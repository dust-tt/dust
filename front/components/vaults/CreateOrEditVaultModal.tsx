import {
  Button,
  DataTable,
  ExclamationCircleStrokeIcon,
  Icon,
  Input,
  Modal,
  Page,
  SliderToggle,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType, SpaceType, UserType } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmDeleteVaultDialog } from "@app/components/vaults/ConfirmDeleteVaultDialog";
import { SearchMembersPopover } from "@app/components/vaults/SearchMembersPopover";
import {
  useCreateVault,
  useDeleteVault,
  useUpdateVault,
  useVaultInfo,
} from "@app/lib/swr/vaults";

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

interface CreateOrEditVaultModalProps {
  defaultRestricted?: boolean;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (vault: SpaceType) => void;
  owner: LightWorkspaceType;
  vault?: SpaceType;
}

export function CreateOrEditVaultModal({
  defaultRestricted,
  isAdmin,
  isOpen,
  onClose,
  onCreated,
  owner,
  vault,
}: CreateOrEditVaultModalProps) {
  const [vaultName, setVaultName] = useState<string | null>(
    vault?.name ?? null
  );
  const [selectedMembers, setSelectedMembers] = useState<UserType[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);

  const doCreate = useCreateVault({ owner });
  const doUpdate = useUpdateVault({ owner });
  const doDelete = useDeleteVault({ owner });

  const router = useRouter();

  const { vaultInfo, mutateVaultInfo } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault?.sId ?? null,
  });

  useEffect(() => {
    if (isOpen) {
      const vaultMembers = vaultInfo?.members ?? null;

      if (vaultMembers && vaultInfo?.isRestricted) {
        setSelectedMembers(vaultMembers);
      }

      setVaultName(vaultInfo?.name ?? null);

      setIsRestricted(
        vaultInfo ? vaultInfo.isRestricted : defaultRestricted ?? false
      );
    }
  }, [defaultRestricted, isOpen, vaultInfo]);

  const handleClose = useCallback(() => {
    // Call the original onClose function.
    onClose();

    setTimeout(() => {
      // Reset state.
      setVaultName("");
      setIsRestricted(false);
      setSelectedMembers([]);
      setShowDeleteConfirmDialog(false);
      setIsDeleting(false);
      setIsSaving(false);
    }, 500);
  }, [onClose]);

  const onSave = useCallback(async () => {
    setIsSaving(true);

    if (vault) {
      if (isRestricted) {
        await doUpdate(vault, {
          isRestricted: true,
          memberIds: selectedMembers.map((vm) => vm.sId),
          name: vaultName,
        });
      } else {
        await doUpdate(vault, {
          isRestricted: false,
          memberIds: null,
          name: vaultName,
        });
      }

      // FIXME: we should update the page vault's name as well.
      await mutateVaultInfo();
    } else if (!vault) {
      let createdVault;

      if (isRestricted) {
        createdVault = await doCreate({
          name: vaultName,
          isRestricted: true,
          memberIds: selectedMembers.map((vm) => vm.sId),
        });
      } else {
        createdVault = await doCreate({
          name: vaultName,
          isRestricted: false,
          memberIds: null, // must be null when isRestricted is false
        });
      }

      setIsSaving(false);
      if (createdVault && onCreated) {
        onCreated(createdVault);
      }
    }

    handleClose();
  }, [
    doCreate,
    doUpdate,
    handleClose,
    isRestricted,
    mutateVaultInfo,
    onCreated,
    selectedMembers,
    vault,
    vaultName,
  ]);

  const onDelete = useCallback(async () => {
    if (!vault) {
      setShowDeleteConfirmDialog(false);
      return;
    }

    setIsDeleting(true);

    const res = await doDelete(vault);
    setIsDeleting(false);
    setShowDeleteConfirmDialog(false);

    if (res) {
      handleClose();
      await router.push(`/w/${owner.sId}/vaults`);
    }
  }, [doDelete, handleClose, owner.sId, router, vault]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={vault ? `Edit ${vault.name}` : "Create a Space"}
      saveLabel={vault ? "Save" : "Create"}
      variant="side-md"
      hasChanged={
        !!vaultName &&
        (!isRestricted || (isRestricted && selectedMembers.length > 0))
      }
      isSaving={isSaving}
      className="flex overflow-visible" // overflow-visible is needed to avoid clipping the delete button
      onSave={onSave}
    >
      <Page.Vertical gap="md" sizing="grow">
        <div className="flex w-full flex-col gap-y-4 overflow-y-hidden">
          <div className="mb-4 flex w-full flex-col gap-y-2 pt-2">
            <Page.SectionHeader title="Name" />
            <Input
              placeholder="Space's name"
              value={vaultName}
              name="vaultName"
              onChange={(e) => setVaultName(e.target.value)}
            />
            {!vault && (
              <div className="flex gap-1 text-xs text-element-700">
                <Icon visual={ExclamationCircleStrokeIcon} size="xs" />
                <span>Space name must be unique</span>
              </div>
            )}
          </div>
          <div className="flex w-full grow flex-col gap-y-2 overflow-y-hidden border-t pt-2">
            <div className="flex w-full items-center justify-between">
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
            <MembersSearchAndList
              isRestricted={isRestricted}
              owner={owner}
              onMembersUpdated={setSelectedMembers}
              selectedMembers={selectedMembers}
            />
          </div>
          {isAdmin && vault && vault.kind === "regular" && (
            <>
              <ConfirmDeleteVaultDialog
                vault={vault}
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

interface MembersSearchAndListProps {
  isRestricted: boolean;
  onMembersUpdated: (members: UserType[]) => void;
  owner: LightWorkspaceType;
  selectedMembers: UserType[];
}

function MembersSearchAndList({
  isRestricted,
  onMembersUpdated,
  owner,
  selectedMembers,
}: MembersSearchAndListProps) {
  const sendNotifications = useSendNotification();

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
        enableSorting: false,
      },
      {
        id: "email",
        cell: (info: Info) => (
          <DataTable.CellContent>
            <span className="text-element-700">{info.row.original.email}</span>
          </DataTable.CellContent>
        ),
        enableSorting: false,
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

  if (!isRestricted) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <SearchMembersPopover
        owner={owner}
        selectedMembers={selectedMembers}
        onMembersUpdated={onMembersUpdated}
      />
      <DataTable
        data={rows}
        columns={columns}
        columnsBreakpoints={{
          email: "md",
        }}
      />
    </div>
  );
}
