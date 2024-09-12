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
import { useSearchMembers } from "@app/lib/swr/user";
import { useVaultInfo, useVaults, useVaultsAsAdmin } from "@app/lib/swr/vaults";
import logger from "@app/logger/logger";

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

  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);

  const { mutate: mutateVaults } = useVaults({
    workspaceId: owner.sId,
    disabled: true, // Disable as we just want the mutation function
  });
  const { mutate: mutateVaultsAsAdmin } = useVaultsAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Disable as we just want the mutation function
  });

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

  const { members, totalMembersCount, isLoading } = useSearchMembers(
    owner.sId,
    searchTerm,
    pagination.pageIndex,
    pagination.pageSize
  );

  const getTableColumns = useCallback(() => {
    return [
      {
        id: "name",
        accessorKey: "name",
        cell: (info: Info) => (
          <DataTable.CellContent avatarUrl={info.row.original.icon}>
            {info.row.original.name}
          </DataTable.CellContent>
        ),
        enableSorting: false,
      },
      {
        id: "email",
        accessorKey: "email",
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
                    setSelectedMembers(
                      selectedMembers.filter(
                        (m) => m !== info.row.original.userId
                      )
                    )
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
                onClick={() =>
                  setSelectedMembers([
                    ...selectedMembers,
                    info.row.original.userId,
                  ])
                }
                variant="secondary"
                size="sm"
                icon={PlusIcon}
              />
            </div>
          );
        },
      },
    ];
  }, [selectedMembers]);

  const createOrUpdateVault = async () => {
    setIsSaving(true);
    try {
      if (selectedMembers.length > 0 && vault) {
        const groupsUrl = `/api/w/${owner.sId}/groups/${vault.groupIds[0]}`;
        const groupsRes = await fetch(groupsUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            memberIds: selectedMembers,
          }),
        });

        if (!groupsRes.ok) {
          const groupsErrorData = await groupsRes.json();
          throw new Error(
            groupsErrorData.error?.message || "Failed to update vault members"
          );
        }
      } else if (!vault) {
        const url = `/api/w/${owner.sId}/vaults`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: vaultName,
            memberIds: selectedMembers,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error?.message || "Failed to create vault");
        }
        const r = await res.json();

        await mutateVaults();
        await mutateVaultsAsAdmin();

        await router.push(`/w/${owner.sId}/vaults/${r.vault.sId}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const rows = useMemo(() => getTableRows(members), [members]);

  const columns = useMemo(() => getTableColumns(), [getTableColumns]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={vault ? `Edit ${vault.name}` : "Create a Vault"}
      saveLabel={vault ? "Save" : "Create"}
      variant="side-md"
      hasChanged={!!vaultName && selectedMembers.length > 0}
      isSaving={isSaving}
      className="flex"
      onSave={async () => {
        try {
          await createOrUpdateVault();
          sendNotification({
            type: "success",
            title: "Successfully created vault",
            description: "Vault was successfully created.",
          });
        } catch (err) {
          if ((err as Error).message === "This vault name is already used.") {
            sendNotification({
              type: "error",
              title: "Vault name is already used.",
              description: "Please choose a different vault name",
            });
            return;
          }
          logger.error(
            {
              workspaceId: owner.id,
              error: err,
            },
            "Error creating vault"
          );
          sendNotification({
            type: "error",
            title: "Failed to create vault",
            description:
              "An unexpected error occurred while creating the vault.",
          });
        }
        onClose();
      }}
    >
      <Page.Vertical gap="md" sizing="grow">
        <div className="flex w-full flex-col gap-y-4">
          <div className="mb-4 flex w-full flex-col gap-y-2 pt-2">
            <Page.SectionHeader title="Name" />
            <Input
              placeholder="Vault's name"
              value={vaultName}
              name="vaultName"
              className={vault ? "text-gray-300 hover:cursor-not-allowed" : ""}
              size="sm"
              onChange={(value) => setVaultName(value)}
              disabled={!!vault}
            />
            {!vault && (
              <div className="flex gap-1 text-xs text-element-700">
                <Icon visual={InformationCircleIcon} size="xs" />
                <span>Vault name must be unique</span>
              </div>
            )}
          </div>
          <div className="flex w-full grow flex-col gap-y-2 border-t pt-2">
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
              <div className="flex grow flex-col overflow-y-auto">
                <DataTable
                  data={rows}
                  columns={columns}
                  pagination={pagination}
                  setPagination={setPagination}
                  totalRowCount={totalMembersCount}
                />
              </div>
            )}
          </div>
        </div>
      </Page.Vertical>
    </Modal>
  );
}
