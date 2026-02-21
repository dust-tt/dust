import { useSendNotification } from "@app/hooks/useNotification";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useUpdateSpace } from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";
import {
  Button,
  CheckIcon,
  createSelectionColumn,
  DataTable,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

type UserRowData = {
  sId: string;
  fullName: string;
  email: string;
  image: string;
  onClick?: () => void;
};

type UserRowInfo = { row: { original: UserRowData } };

function getUserTableRows(members: SpaceUserType[]): UserRowData[] {
  return members.map((user) => ({
    sId: user.sId,
    fullName: user.fullName,
    email: user.email ?? "",
    image: user.image ?? "",
  }));
}

interface ManageUsersPanelProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  owner: LightWorkspaceType;
  space: SpaceType;
  currentProjectMembers: SpaceUserType[];
  onSuccess?: () => void | Promise<void>;
}

export function ManageUsersPanel({
  isOpen,
  setIsOpen,
  owner,
  space,
  currentProjectMembers,
  onSuccess,
}: ManageUsersPanelProps) {
  const [searchText, setSearchText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const sendNotification = useSendNotification();
  const doUpdateSpace = useUpdateSpace({ owner });

  const { members, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: 0,
    pageSize: 100,
  });

  const [currentMembers, setCurrentMembers] = useState<Set<string>>(new Set());
  const [currentEditors, setCurrentEditors] = useState<Set<string>>(new Set());

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    setCurrentMembers(new Set(currentProjectMembers.map((m) => m.sId)));
    setCurrentEditors(
      new Set(currentProjectMembers.filter((m) => m.isEditor).map((m) => m.sId))
    );
  }, [isOpen, currentProjectMembers]);

  const toggleEditor = (userId: string) => {
    if (!currentMembers.has(userId)) {
      return;
    }
    setCurrentEditors((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);

    const memberIds = Array.from(currentMembers).filter(
      (id) => !currentEditors.has(id)
    );
    const editorIds = Array.from(currentEditors);

    if (editorIds.length === 0) {
      setIsOpen(false);
      sendNotification({
        title: "At least one editor is required.",
        description: "You cannot remove the last editor.",
        type: "error",
      });
      setIsSaving(false);
      return;
    }

    const updatedSpace = await doUpdateSpace(
      space,
      {
        isRestricted: space.isRestricted,
        memberIds,
        editorIds,
        managementMode: "manual",
        name: space.name,
      },
      {
        title: "Successfully updated project members",
        description: "Project members were successfully updated.",
      }
    );

    if (updatedSpace) {
      await onSuccess?.();
      setIsOpen(false);
    }
    setIsSaving(false);
  };

  const handleClose = () => {
    setSearchText("");
    setIsOpen(false);
  };

  const rows = useMemo(() => getUserTableRows(members), [members]);

  const rowSelectionState: RowSelectionState = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const sId of currentMembers) {
      state[sId] = true;
    }
    return state;
  }, [currentMembers]);

  const handleRowSelectionChange = (newSelection: RowSelectionState) => {
    const newMembers = new Set(
      Object.entries(newSelection)
        .filter(([, selected]) => selected)
        .map(([sId]) => sId)
    );
    setCurrentMembers(newMembers);

    setCurrentEditors((prevEditors) => {
      const nextEditors = new Set(prevEditors);
      for (const editorId of prevEditors) {
        if (!newMembers.has(editorId)) {
          nextEditors.delete(editorId);
        }
      }
      return nextEditors;
    });
  };

  const columns: ColumnDef<UserRowData>[] = useMemo(
    () => [
      createSelectionColumn<UserRowData>(),
      {
        accessorKey: "fullName",
        header: "Name",
        id: "fullName",
        sortingFn: "text",
        meta: {
          className: "w-full",
        },
        cell: (info: UserRowInfo) => (
          <DataTable.CellContent
            avatarUrl={info.row.original.image}
            roundedAvatar
            description={info.row.original.email}
          >
            {info.row.original.fullName}
          </DataTable.CellContent>
        ),
      },
      {
        id: "editor",
        header: "",
        meta: {
          className: "w-28",
        },
        cell: (info: UserRowInfo) => {
          const { sId } = info.row.original;
          const isMember = currentMembers.has(sId);
          const isEditor = currentEditors.has(sId);

          if (!isMember) {
            return null;
          }

          return (
            <DataTable.CellContent>
              <Button
                size="xs"
                variant={isEditor ? "highlight" : "outline"}
                label={isEditor ? "Editor" : "Set as editor"}
                icon={isEditor ? CheckIcon : undefined}
                onClick={(e) => {
                  toggleEditor(sId);
                  e.stopPropagation();
                }}
              />
            </DataTable.CellContent>
          );
        },
      },
    ],
    [currentMembers, currentEditors, toggleEditor]
  );

  const canSave = currentEditors.size > 0 && !isSaving;
  const saveButtonLabel =
    currentMembers.size > 0 ? `Save (${currentMembers.size})` : "Save";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent size="lg" side="right">
        <SheetHeader>
          <SheetTitle>Manage Members of {space.name}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <SearchInput
            name="user-search"
            value={searchText}
            onChange={setSearchText}
            placeholder="Search users..."
            className="mt-2"
          />
          <div className="flex min-h-0 flex-1 flex-col">
            {isLoading ? (
              <div className="flex items-center justify-center p-4">
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Loading users...
                </span>
              </div>
            ) : (
              <DataTable
                data={rows}
                columns={columns}
                rowSelection={rowSelectionState}
                setRowSelection={handleRowSelectionChange}
                enableRowSelection
                getRowId={(row) => row.sId}
                filter={searchText}
                filterColumn="fullName"
              />
            )}
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: saveButtonLabel,
            variant: "highlight",
            onClick: handleSave,
            disabled: !canSave,
            isLoading: isSaving,
            tooltip: !canSave
              ? "Please select at least one editor to save."
              : undefined,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
