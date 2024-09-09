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
import type { LightWorkspaceType, UserType } from "@dust-tt/types";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import type { CellContext } from "@tanstack/react-table";
import { MinusIcon } from "lucide-react";
import { useRouter } from "next/router";
import React, { useCallback, useContext, useMemo, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useMembers } from "@app/lib/swr/memberships";
import { useVaults, useVaultsAsAdmin } from "@app/lib/swr/vaults";
import logger from "@app/logger/logger";
import type { PostVaultsResponseBody } from "@app/pages/api/w/[wId]/vaults";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  onClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

interface CreateVaultModalProps {
  owner: LightWorkspaceType;
  isOpen: boolean;
  onClose: () => void;
}

function getTableRows(allUsers: UserType[]): RowData[] {
  return allUsers.map((user) => ({
    icon: user.image ?? "",
    name: user.fullName,
    userId: user.sId,
  }));
}

export function CreateVaultModal({
  owner,
  isOpen,
  onClose,
}: CreateVaultModalProps) {
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const { mutate: mutateVaults } = useVaults({
    workspaceId: owner.sId,
    disabled: true, // Disable as we just want the mutation function
  });
  const { mutate: mutateVaultsAsAdmin } = useVaultsAsAdmin({
    workspaceId: owner.sId,
    disabled: true, // Disable as we just want the mutation function
  });
  const router = useRouter();
  const { members, isMembersLoading } = useMembers(owner);
  const sendNotification = useContext(SendNotificationsContext);

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
      },
      {
        id: "action",
        cell: (info: Info) => {
          const isSelected = selectedMembers.includes(info.row.original.userId);
          if (isSelected) {
            return (
              <div className="full-width flex justify-end">
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
            <div className="full-width flex justify-end">
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

  const createVault = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/w/${owner.sId}/vaults`, {
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
      const r: PostVaultsResponseBody = await res.json();

      // Invalidate the vaults list
      await mutateVaults();
      await mutateVaultsAsAdmin();

      await router.push(`/w/${owner.sId}/vaults/${r.vault.sId}`);
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
      title="Create a Vault"
      saveLabel="Create"
      variant="side-md"
      hasChanged={!!vaultName && selectedMembers.length > 0}
      isSaving={isSaving}
      className="flex"
      onSave={async () => {
        try {
          await createVault();
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
              size="sm"
              onChange={(value) => setVaultName(value)}
            />
            <div className="flex gap-1 text-xs text-element-700">
              <Icon visual={InformationCircleIcon} size="xs" />
              <span>Vault name must be unique</span>
            </div>
          </div>
          <div className="flex w-full grow flex-col gap-y-2 border-t pt-2">
            <Page.SectionHeader title="Vault members" />
            <div className="flex w-full">
              <Searchbar
                name="search"
                placeholder="Search members"
                value={searchTerm}
                onChange={setSearchTerm}
              />
            </div>
            {isMembersLoading ? (
              <div className="mt-8 flex justify-center">
                <Spinner size="lg" variant="color" />
              </div>
            ) : (
              <div className="flex grow flex-col overflow-y-auto">
                <DataTable
                  data={rows}
                  columns={columns}
                  filterColumn="name"
                  filter={searchTerm}
                />
              </div>
            )}
          </div>
        </div>
      </Page.Vertical>
    </Modal>
  );
}
