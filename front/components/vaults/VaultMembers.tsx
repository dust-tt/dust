import { Button, DataTable, Searchbar } from "@dust-tt/sparkle";
import type { VaultType, WorkspaceType } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { MinusIcon } from "lucide-react";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { ManageMembersModal } from "@app/components/vaults/ManageMembersModal";
import { useVaultInfo } from "@app/lib/swr/vaults";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  onClick?: () => void;
  moreMenuItems: {
    variant?: "default" | "warning";
    label: string;
    description?: string;
    icon: React.ComponentType;
    onClick: () => void;
  }[];
};

const tableColumns = [
  {
    id: "name",
    cell: (info: CellContext<RowData, string>) => (
      <DataTable.CellContent avatarUrl={info.row.original.icon}>
        {info.getValue()}
      </DataTable.CellContent>
    ),
    accessorFn: (row: RowData) => row.name,
  },
];

type VaultMembersProps = {
  owner: WorkspaceType;
  isAdmin: boolean;
  vault: VaultType;
};

export const VaultMembers = ({ owner, isAdmin, vault }: VaultMembersProps) => {
  const [memberSearch, setMemberSearch] = useState<string>("");
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  const { vaultInfo, isVaultInfoLoading, mutateVaultInfo } = useVaultInfo({
    workspaceId: owner.sId,
    vaultId: vault.sId,
  });

  const members = vaultInfo?.members || [];

  const setMemberIds = async (memberIds: string[]) => {
    const res = await fetch(`/api/w/${owner.sId}/groups/${vault.groupIds[0]}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memberIds,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      logger.error(
        {
          workspaceId: owner.id,
          error: errorData.error,
        },
        "Error creating vault"
      );

      sendNotification({
        type: "error",
        title: "Failed to update members",
        description:
          "An unexpected error occurred while creating the vault. " +
          errorData.error
            ? errorData.error.message
            : "",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Members updated",
        description: "Members have been updated successfully.",
      });

      await mutateVaultInfo();
    }
  };

  const rows: RowData[] = members
    .map((member) => ({
      icon: member.image || "",
      name: member.fullName,
      userId: member.sId,
      moreMenuItems: [
        {
          label: "Remove",
          icon: MinusIcon,
          onClick: async () => {
            await setMemberIds(
              members.map((m) => m.sId).filter((id) => id !== member.sId)
            );
          },
        },
      ],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div
        className={classNames(
          "flex gap-2",
          rows.length === 0 && isAdmin
            ? "h-36 w-full max-w-4xl items-center justify-center rounded-lg border bg-structure-50"
            : ""
        )}
      >
        {rows.length > 0 && (
          <Searchbar
            name="search"
            placeholder="Search (Name)"
            value={memberSearch}
            onChange={(s) => {
              setMemberSearch(s);
            }}
          />
        )}
        <Button
          label="Add Members"
          onClick={() => {
            setAddMemberModalOpen(true);
          }}
        />
      </div>
      {isVaultInfoLoading ? (
        <></>
      ) : rows.length > 0 ? (
        <DataTable
          data={rows}
          columns={tableColumns}
          filterColumn="name"
          filter={memberSearch}
        />
      ) : (
        <div className="flex items-center justify-center text-sm font-normal text-element-700">
          No members
        </div>
      )}
      {vaultInfo && (
        <ManageMembersModal
          isOpen={addMemberModalOpen}
          onClose={() => setAddMemberModalOpen(false)}
          owner={owner}
          setMemberIds={setMemberIds}
          existingMembers={vaultInfo.members}
        />
      )}
    </>
  );
};
