import type { GroupRowData } from "@app/components/groups/GroupSelectionTable";
import { GroupSelectionTable } from "@app/components/groups/GroupSelectionTable";
import { spaceMembershipDimensions } from "@app/lib/spaces_utils";
import { useUpdateSpace } from "@app/lib/swr/spaces";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Check,
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

interface ManagePodGroupsPanelProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  owner: LightWorkspaceType;
  pod: RichSpaceType;
  onSuccess?: () => void | Promise<void>;
}

/**
 * Picks the groups given access to a Pod, and whether each is an editor — the counterpart of
 * `ManageUsersPanel` for the Pod's group members. Saving sends the Pod's whole membership, with
 * the individual members passed through untouched.
 */
export function ManagePodGroupsPanel({
  isOpen,
  setIsOpen,
  owner,
  pod,
  onSuccess,
}: ManagePodGroupsPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const doUpdateSpace = useUpdateSpace({ owner });

  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set()
  );
  const [editorGroupIds, setEditorGroupIds] = useState<Set<string>>(new Set());

  // The Pod's current groups are the starting point every time the panel opens, so a cancelled
  // edit leaves nothing behind. Keyed on `isOpen` only: `pod.groups` is a new array on every SWR
  // revalidation, and re-running then would wipe the selection being edited.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset state when the panel opens
  useEffect(() => {
    if (isOpen) {
      setSelectedGroupIds(new Set(pod.groups.map((group) => group.sId)));
      setEditorGroupIds(
        new Set(
          pod.groups
            .filter((group) => group.role === "editor")
            .map((group) => group.sId)
        )
      );
    }
  }, [isOpen]);

  const handleSelectionChange = useCallback(
    (ids: Set<string>, _groups: GroupType[]) => {
      setSelectedGroupIds(ids);
      // A group that is no longer selected cannot stay an editor.
      setEditorGroupIds((previous) => {
        const next = new Set(previous);
        for (const id of previous) {
          if (!ids.has(id)) {
            next.delete(id);
          }
        }
        return next;
      });
    },
    []
  );

  const toggleEditor = useCallback((groupId: string) => {
    setEditorGroupIds((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const editorColumn: ColumnDef<GroupRowData>[] = useMemo(() => {
    if (pod.isAdminControlled) {
      return [];
    }
    return [
      {
        id: "editor",
        header: "",
        meta: { className: "w-28" },
        cell: (info: CellContext<GroupRowData, unknown>) => {
          const { sId } = info.row.original;
          if (!selectedGroupIds.has(sId)) {
            return null;
          }
          const isEditor = editorGroupIds.has(sId);
          return (
            <DataTable.CellContent>
              <Button
                size="xs"
                variant={isEditor ? "highlight" : "outline"}
                label={isEditor ? "Editor" : "Set as editor"}
                icon={isEditor ? Check : undefined}
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
  }, [pod.isAdminControlled, selectedGroupIds, editorGroupIds, toggleEditor]);

  const handleSave = async () => {
    setIsSaving(true);

    const dimensions = spaceMembershipDimensions(pod);
    const updatedSpace = await doUpdateSpace(
      pod,
      {
        isRestricted: pod.isRestricted,
        name: pod.name,
        ...dimensions,
        groupIds: Array.from(selectedGroupIds).filter(
          (id) => !editorGroupIds.has(id)
        ),
        editorGroupIds: Array.from(editorGroupIds),
      },
      {
        title: "Successfully updated Pod groups",
        description: "The groups with access to this Pod were updated.",
      }
    );

    if (updatedSpace) {
      await onSuccess?.();
      setIsOpen(false);
    }

    setIsSaving(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && setIsOpen(false)}>
      <SheetContent size="lg" side="right">
        <SheetHeader>
          <SheetTitle>{`Manage Groups of ${pod.name}`}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <GroupSelectionTable
            owner={owner}
            selectedGroupIds={selectedGroupIds}
            onSelectionChange={handleSelectionChange}
            extraColumns={editorColumn}
          />
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => setIsOpen(false),
          }}
          rightButtonProps={{
            label: "Save",
            variant: "highlight",
            onClick: handleSave,
            disabled: isSaving,
            isLoading: isSaving,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
