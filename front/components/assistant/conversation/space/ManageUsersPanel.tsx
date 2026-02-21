import { useSendNotification } from "@app/hooks/useNotification";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useUpdateSpace } from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";
import type {
  LightWorkspaceType,
  SpaceUserType,
  UserType,
} from "@app/types/user";
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
import { useEffect, useMemo, useRef, useState } from "react";

interface UserRowData {
  sId: string;
  fullName: string;
  email: string;
  image: string;
  onClick?: () => void;
}

interface UserRowInfo {
  row: { original: UserRowData };
}

function getUserTableRows(
  members: Pick<UserType, "sId" | "fullName" | "email" | "image">[]
): UserRowData[] {
  return members.map((user) => ({
    sId: user.sId,
    fullName: user.fullName,
    email: user.email ?? "",
    image: user.image ?? "",
  }));
}

interface BaseManageUsersPanelProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  owner: LightWorkspaceType;
}

interface SpaceMembersMode extends BaseManageUsersPanelProps {
  mode: "space-members";
  space: SpaceType;
  currentProjectMembers: SpaceUserType[];
  onSuccess?: () => void | Promise<void>;
}

interface EditorsOnlyMode extends BaseManageUsersPanelProps {
  mode: "editors-only";
  editors: UserType[];
  onEditorsChange: (editors: UserType[]) => void;
  title?: string;
  buildersOnly?: boolean;
}

type ManageUsersPanelProps = SpaceMembersMode | EditorsOnlyMode;

export function ManageUsersPanel(props: ManageUsersPanelProps) {
  const { isOpen, setIsOpen, owner, mode } = props;

  const [searchText, setSearchText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const sendNotification = useSendNotification();
  const doUpdateSpace = useUpdateSpace({ owner });

  const buildersOnly = mode === "editors-only" ? props.buildersOnly : undefined;

  const { members, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: 0,
    pageSize: 100,
    buildersOnly,
  });

  const [currentMembers, setCurrentMembers] = useState<Set<string>>(new Set());
  const [currentEditors, setCurrentEditors] = useState<Set<string>>(new Set());

  // In editors-only mode, track a map of all seen users to reconstruct
  // full UserType[] on save.
  const userMapRef = useRef<Map<string, UserType>>(new Map());

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset state when panel opens
  useEffect(() => {
    if (mode === "space-members") {
      setCurrentMembers(new Set(props.currentProjectMembers.map((m) => m.sId)));
      setCurrentEditors(
        new Set(
          props.currentProjectMembers
            .filter((m) => m.isEditor)
            .map((m) => m.sId)
        )
      );
    } else {
      const editorIds = new Set(props.editors.map((e) => e.sId));
      setCurrentMembers(editorIds);
      // Seed the user map with initial editors.
      const map = new Map<string, UserType>();
      for (const editor of props.editors) {
        map.set(editor.sId, editor);
      }
      userMapRef.current = map;
    }
  }, [isOpen]);

  // In editors-only mode, index search results into the user map.
  useEffect(() => {
    if (mode === "editors-only") {
      for (const member of members) {
        if (!userMapRef.current.has(member.sId)) {
          userMapRef.current.set(member.sId, member);
        }
      }
    }
  }, [members, mode]);

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

    if (mode === "space-members") {
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
        props.space,
        {
          isRestricted: props.space.isRestricted,
          memberIds,
          editorIds,
          managementMode: "manual",
          name: props.space.name,
        },
        {
          title: "Successfully updated project members",
          description: "Project members were successfully updated.",
        }
      );

      if (updatedSpace) {
        await props.onSuccess?.();
        setIsOpen(false);
      }
    } else {
      const selectedUsers = Array.from(currentMembers)
        .map((sId) => userMapRef.current.get(sId))
        .filter((user): user is UserType => user !== undefined);
      props.onEditorsChange(selectedUsers);
      setIsOpen(false);
    }

    setIsSaving(false);
  };

  const handleClose = () => {
    setSearchText("");
    setIsOpen(false);
  };

  const rows = useMemo(() => getUserTableRows(members), [members]);

  const rowSelectionState: RowSelectionState = useMemo(
    () => Object.fromEntries(Array.from(currentMembers, (sId) => [sId, true])),
    [currentMembers]
  );

  const handleRowSelectionChange = (newSelection: RowSelectionState) => {
    const newMembers = new Set(
      Object.entries(newSelection)
        .filter(([, selected]) => selected)
        .map(([sId]) => sId)
    );
    setCurrentMembers(newMembers);

    if (mode === "space-members") {
      setCurrentEditors((prevEditors) => {
        const nextEditors = new Set(prevEditors);
        for (const editorId of prevEditors) {
          if (!newMembers.has(editorId)) {
            nextEditors.delete(editorId);
          }
        }
        return nextEditors;
      });
    }
  };

  const columns: ColumnDef<UserRowData>[] = useMemo(() => {
    const baseColumns: ColumnDef<UserRowData>[] = [
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
    ];

    if (mode === "space-members") {
      baseColumns.push({
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
      });
    }

    return baseColumns;
  }, [mode, currentMembers, currentEditors, toggleEditor]);

  const canSave =
    mode === "space-members" ? currentEditors.size > 0 && !isSaving : !isSaving;

  const saveButtonLabel =
    currentMembers.size > 0 ? `Save (${currentMembers.size})` : "Save";

  const sheetTitle =
    mode === "space-members"
      ? `Manage Members of ${props.space.name}`
      : (props.title ?? "Manage Editors");

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent size="lg" side="right">
        <SheetHeader>
          <SheetTitle>{sheetTitle}</SheetTitle>
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
            tooltip:
              !canSave && mode === "space-members"
                ? "Please select at least one editor to save."
                : undefined,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
