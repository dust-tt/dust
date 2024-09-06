import {
  Button,
  DataTable,
  Modal,
  Page,
  PlusIcon,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType, UserType } from "@dust-tt/types";
import type { CellContext, Row } from "@tanstack/react-table";
import { MinusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useMembers } from "@app/lib/swr/memberships";
import { removeDiacritics } from "@app/lib/utils";

type RowData = {
  icon: string;
  name: string;
  userId: string;
  onClick?: () => void;
};

interface ManageMembersModalProps {
  owner: LightWorkspaceType;
  isOpen: boolean;
  existingMembers: UserType[];
  setMemberIds: (s: string[]) => Promise<void>;
  onClose: () => void;
}

function getTableRows(allUsers: UserType[]): RowData[] {
  return allUsers
    .map((user) => ({
      icon: user.image ?? "",
      name: user.fullName,
      userId: user.sId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ManageMembersModal({
  owner,
  isOpen,
  existingMembers,
  setMemberIds,
  onClose,
}: ManageMembersModalProps) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const { members, isMembersLoading } = useMembers(owner);

  const existingMemberIds = useMemo(
    () => existingMembers.map((m) => m.sId).sort(),
    [existingMembers]
  );

  useEffect(() => {
    setSelectedMemberIds(existingMemberIds);
  }, [existingMemberIds]);

  const getTableColumns = useCallback(() => {
    return [
      {
        id: "name",
        cell: (info: CellContext<RowData, string>) => (
          <DataTable.CellContent avatarUrl={info.row.original.icon}>
            {info.getValue()}
          </DataTable.CellContent>
        ),
        accessorFn: (row: RowData) => row.name,
        filterFn: (row: Row<RowData>, columnId: string, filterValue: any) => {
          if (!filterValue) {
            return true;
          }

          return removeDiacritics(row.original.name)
            .toLowerCase()
            .includes(removeDiacritics(filterValue).toLowerCase());
        },
      },
      {
        id: "action",
        cell: (info: CellContext<RowData, unknown>) => {
          const isSelected = selectedMemberIds.includes(
            info.row.original.userId
          );
          if (isSelected) {
            return (
              <div className="full-width flex justify-end">
                <Button
                  label="Remove"
                  onClick={() =>
                    setSelectedMemberIds(
                      selectedMemberIds
                        .filter((m) => m !== info.row.original.userId)
                        .sort()
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
                  setSelectedMemberIds([
                    ...selectedMemberIds,
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
  }, [selectedMemberIds]);

  const rows = useMemo(() => getTableRows(members), [members]);

  const columns = useMemo(() => getTableColumns(), [getTableColumns]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setSelectedMemberIds(existingMemberIds);
        onClose();
      }}
      title="Edit members"
      saveLabel="Save"
      variant="side-md"
      hasChanged={existingMemberIds.join(",") !== selectedMemberIds.join(",")}
      isSaving={isSaving}
      className="flex"
      onSave={async () => {
        setIsSaving(true);
        await setMemberIds(selectedMemberIds);
        setIsSaving(false);
        onClose();
      }}
    >
      <Page.Vertical gap="md" sizing="grow">
        <div className="flex w-full grow flex-col gap-y-4 overflow-y-hidden border-t p-4">
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
            <div className="flex grow flex-col overflow-y-auto p-4">
              <DataTable
                data={rows}
                columns={columns}
                filterColumn="name"
                filter={searchTerm}
              />
            </div>
          )}
        </div>
      </Page.Vertical>
    </Modal>
  );
}
