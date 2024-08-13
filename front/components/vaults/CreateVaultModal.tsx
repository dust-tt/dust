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
import type {
  LightWorkspaceType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { InformationCircleIcon } from "@heroicons/react/20/solid";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { MinusIcon } from "lucide-react";
import React, { useCallback, useContext, useMemo, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useMembers } from "@app/lib/swr";
import logger from "@app/logger/logger";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  onClick?: () => void;
  onMoreClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

interface CreateVaultModalProps {
  owner: WorkspaceType | LightWorkspaceType;
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

function getTableRows(allUsers: UserType[]): RowData[] {
  return allUsers.map((user) => {
    return {
      icon: user.image ?? "",
      name: user.fullName,
      userId: user.sId,
    };
  });
}

function getTableColumns(
  selectedMembers: string[],
  handleMemberToggle: (member: string) => void
): ColumnDef<RowData, unknown>[] {
  return [
    {
      id: "name",
      cell: (info: Info) => (
        <DataTable.Cell avatarUrl={info.row.original.icon}>
          {info.row.original.name}
        </DataTable.Cell>
      ),
    },
    {
      id: "action",
      cell: (info: Info) => {
        const isSelected = selectedMembers.includes(info.row.original.userId);
        if (isSelected) {
          return (
            <Button
              label="Remove"
              onClick={() => handleMemberToggle(info.row.original.userId)}
              variant="tertiary"
              size="sm"
              icon={MinusIcon}
            />
          );
        }
        return (
          <Button
            label="Add"
            onClick={() => handleMemberToggle(info.row.original.userId)}
            variant="secondary"
            size="sm"
            icon={PlusIcon}
          />
        );
      },
    },
  ];
}

export function CreateVaultModal({
  owner,
  isOpen,
  onClose,
  onSave,
}: CreateVaultModalProps) {
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const { members, isMembersLoading } = useMembers(owner);
  const sendNotification = useContext(SendNotificationsContext);

  const handleMemberToggle = useCallback((member: string) => {
    setSelectedMembers((prevSelectedMembers) => {
      const isCurrentlySelected = prevSelectedMembers.includes(member);
      if (isCurrentlySelected) {
        return prevSelectedMembers.filter((m) => m !== member);
      } else {
        return [...prevSelectedMembers, member];
      }
    });
  }, []);

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
          membersId: selectedMembers,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Failed to create vault");
      }
      return await res.json();
    } finally {
      setIsSaving(false);
    }
  };

  const rows = useMemo(() => getTableRows(members), [members]);

  const columns = useMemo(
    () => getTableColumns(selectedMembers, handleMemberToggle),
    [selectedMembers, handleMemberToggle]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create a Vault"
      saveLabel="Create"
      variant="side-md"
      hasChanged={!!vaultName && selectedMembers.length > 0}
      isSaving={isSaving}
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
        if (onSave) {
          onSave();
        }
      }}
    >
      <Page.Vertical gap="md">
        <div className="mb-4 flex w-full max-w-xl flex-col gap-y-2 p-4">
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
        <div className="flex w-full flex-col gap-y-4 border-t p-4">
          <Page.SectionHeader title="Vault members" />
          <Searchbar
            name="search"
            placeholder="Search members"
            value={searchTerm}
            onChange={setSearchTerm}
          />
          {isMembersLoading ? (
            <div className="mt-8 flex justify-center">
              <Spinner size="lg" variant="color" />
            </div>
          ) : (
            <DataTable
              data={rows}
              columns={columns}
              filterColumn="name"
              filter={searchTerm}
            />
          )}
        </div>
      </Page.Vertical>
    </Modal>
  );
}
