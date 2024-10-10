import {
  Button,
  DataTable,
  Icon,
  Input,
  Modal,
  Page,
  PlusIcon,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType, UserType, VaultType } from "@dust-tt/types";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import type { CellContext, PaginationState } from "@tanstack/react-table";
import { MinusIcon } from "lucide-react";
import { useRouter } from "next/router";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { ConfirmDeleteVaultDialog } from "@app/components/vaults/ConfirmDeleteVaultDialog";
import { useSearchMembers } from "@app/lib/swr/memberships";
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

interface CreateOrEditVaultModalProps {
  owner: LightWorkspaceType;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (vault: VaultType) => void;
  isAdmin: boolean;
  vault?: VaultType;
}

function getTableRows(allUsers: UserType[]): RowData[] {
  return allUsers.map((user) => ({
    icon: user.image ?? "",
    name: user.fullName,
    userId: user.sId,
    email: user.email ?? "",
  }));
}

export function CreateOrEditVaultModal({
  owner,
  isOpen,
  onClose,
  onCreated,
  isAdmin,
  vault,
}: CreateOrEditVaultModalProps) {
  const [vaultName, setVaultName] = useState<string | null>(
    vault?.name ?? null
  );
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const sendNotifications = useContext(SendNotificationsContext);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const doCreate = useCreateVault({ owner });
  const doUpdate = useUpdateVault({ owner });
  const doDelete = useDeleteVault({ owner });

  const router = useRouter();

  const { vaultInfo } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault?.sId ?? null,
  });
  const vaultMembers = vaultInfo?.members ?? null;

  useEffect(() => {
    if (vaultMembers) {
      setSelectedMembers(vaultMembers.map((vm) => vm.sId));
      setVaultName(vault?.name ?? null);
    }
  }, [vault?.name, vaultMembers]);

  const { members, totalMembersCount, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    disabled: !isAdmin,
  });

  const handleClose = useCallback(() => {
    // Reset state.
    setVaultName(null);
    setSelectedMembers([]);
    setSearchTerm("");
    setIsSaving(false);
    setPagination({ pageIndex: 0, pageSize: 25 });
    setShowDeleteConfirmDialog(false);
    setIsDeleting(false);

    // Call the original onClose function.
    onClose();
  }, [onClose]);

  const getTableColumns = useCallback(() => {
    const manageMembers = (userId: string, addOrRemove: "add" | "remove") => {
      if (addOrRemove === "remove") {
        if (selectedMembers.length === 1) {
          sendNotifications({
            title: "Cannot remove last member.",
            description: "You cannot remove the last group member.",
            type: "error",
          });
          return;
        }
        setSelectedMembers(selectedMembers.filter((m) => m !== userId));
      } else {
        setSelectedMembers([...selectedMembers, userId]);
      }
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
        meta: {
          width: "10rem",
        },
        cell: (info: Info) => {
          const isSelected = selectedMembers.includes(info.row.original.userId);
          if (isSelected) {
            return (
              <div className="ml-4 flex w-full justify-end pr-2">
                <Button
                  label="Remove"
                  onClick={() =>
                    manageMembers(info.row.original.userId, "remove")
                  }
                  variant="tertiary"
                  size="sm"
                  icon={MinusIcon}
                />
              </div>
            );
          }
          return (
            <div className="ml-4 flex w-full justify-end pr-2">
              <Button
                label="Add"
                onClick={() => manageMembers(info.row.original.userId, "add")}
                variant="secondary"
                size="sm"
                icon={PlusIcon}
              />
            </div>
          );
        },
      },
    ];
  }, [selectedMembers, sendNotifications]);

  const rows = useMemo(() => getTableRows(members), [members]);

  const columns = useMemo(() => getTableColumns(), [getTableColumns]);

  const onSave = useCallback(async () => {
    setIsSaving(true);

    if (selectedMembers.length > 0 && vault) {
      await doUpdate(vault, selectedMembers, vaultName);
    } else if (!vault) {
      const createdVault = await doCreate(vaultName, selectedMembers);
      setIsSaving(false);
      if (createdVault && onCreated) {
        onCreated(createdVault);
      }
    }
    handleClose();
  }, [
    doCreate,
    doUpdate,
    onCreated,
    handleClose,
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
      title={vault ? `Edit ${vault.name}` : "Create a Vault"}
      saveLabel={vault ? "Save" : "Create"}
      variant="side-md"
      hasChanged={!!vaultName && selectedMembers.length > 0}
      isSaving={isSaving}
      className="flex overflow-visible" // overflow-visible is needed to avoid clipping the delete button
      onSave={onSave}
    >
      <Page.Vertical gap="md" sizing="grow">
        <div className="flex w-full flex-col gap-y-4 overflow-y-hidden">
          <div className="mb-4 flex w-full flex-col gap-y-2 pt-2">
            <Page.SectionHeader title="Name" />
            <Input
              placeholder="Vault's name"
              value={vaultName}
              name="vaultName"
              onChange={(e) => setVaultName(e.target.value)}
            />
            {!vault && (
              <div className="flex gap-1 text-xs text-element-700">
                <Icon visual={InformationCircleIcon} size="xs" />
                <span>Vault name must be unique</span>
              </div>
            )}
          </div>
          <div className="flex w-full grow flex-col gap-y-2 overflow-y-hidden border-t pt-2">
            <Page.SectionHeader title="Vault members" />
            <div className="flex w-full">
              <Searchbar
                name="search"
                placeholder="Search members (email)"
                value={searchTerm}
                onChange={setSearchTerm}
              />
            </div>
            {isLoading ? (
              <div className="mt-8 flex justify-center">
                <Spinner size="lg" variant="color" />
              </div>
            ) : (
              <div className="flex grow flex-col overflow-y-auto scrollbar-hide">
                <DataTable
                  data={rows}
                  columns={columns}
                  pagination={pagination}
                  setPagination={setPagination}
                  totalRowCount={totalMembersCount}
                  columnsBreakpoints={{
                    email: "md",
                  }}
                />
              </div>
            )}
          </div>
          {isAdmin && vault && vault.kind === "regular" && (
            <>
              <Page.Separator />
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
                  label="Delete Vault"
                  variant="primaryWarning"
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
