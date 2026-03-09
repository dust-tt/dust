import type { MemberRowData } from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import { useSendNotification } from "@app/hooks/useNotification";
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
  DataTable,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

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

  const [isSaving, setIsSaving] = useState(false);
  const sendNotification = useSendNotification();
  const doUpdateSpace = useUpdateSpace({ owner });

  const buildersOnly = mode === "editors-only" ? props.buildersOnly : undefined;

  const [currentMembers, setCurrentMembers] = useState<Set<string>>(new Set());
  const [currentEditors, setCurrentEditors] = useState<Set<string>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<UserType[]>([]);

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
    } else if (mode === "editors-only") {
      setCurrentMembers(new Set(props.editors.map((e) => e.sId)));
      setSelectedUsers(props.editors);
    }
  }, [isOpen]);

  const toggleEditor = useCallback(
    (userId: string) => {
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
    },
    [currentMembers]
  );

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
    } else if (mode === "editors-only") {
      props.onEditorsChange(selectedUsers);
      setIsOpen(false);
    }

    setIsSaving(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSelectionChange = (
    newMembers: Set<string>,
    users: UserType[]
  ) => {
    setCurrentMembers(newMembers);
    setSelectedUsers(users);

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

  const editorColumn: ColumnDef<MemberRowData>[] = useMemo(() => {
    if (mode !== "space-members") {
      return [];
    }
    return [
      {
        id: "editor",
        header: "",
        meta: {
          className: "w-28",
        },
        cell: (info: CellContext<MemberRowData, unknown>) => {
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
    ];
  }, [mode, currentMembers, currentEditors, toggleEditor]);

  const initialMembers = mode === "editors-only" ? props.editors : undefined;

  const canSave =
    !isSaving && (mode !== "space-members" || currentEditors.size > 0);

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
          <MemberSelectionTable
            owner={owner}
            selectedMemberIds={currentMembers}
            onSelectionChange={handleSelectionChange}
            extraColumns={editorColumn}
            buildersOnly={buildersOnly}
            initialMembers={initialMembers}
          />
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Save",
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
