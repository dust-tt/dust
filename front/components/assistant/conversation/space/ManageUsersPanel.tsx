import {
  Avatar,
  Button,
  Checkbox,
  CheckIcon,
  ListGroup,
  ListItem,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useUpdateSpace } from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";

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

  // Fetch workspace members
  const { members, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: 0,
    pageSize: 100,
  });

  // Current selected members and editors (persists even when members disappear from search)
  const [currentMembers, setCurrentMembers] = useState<Set<string>>(new Set());
  const [currentEditors, setCurrentEditors] = useState<Set<string>>(new Set());

  // Initialize current members/editors from props when modal opens
  useEffect(() => {
    setCurrentMembers(new Set(currentProjectMembers.map((m) => m.sId)));
    setCurrentEditors(
      new Set(currentProjectMembers.filter((m) => m.isEditor).map((m) => m.sId))
    );
  }, [isOpen, currentProjectMembers]);

  const toggleUser = (userId: string) => {
    setCurrentMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
        // Also remove from editors if they were an editor
        setCurrentEditors((prevEditors) => {
          const nextEditors = new Set(prevEditors);
          nextEditors.delete(userId);
          return nextEditors;
        });
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleEditor = (userId: string) => {
    // Only toggle if they're a member
    if (currentMembers.has(userId)) {
      setCurrentEditors((prev) => {
        const next = new Set(prev);
        if (next.has(userId)) {
          next.delete(userId);
        } else {
          next.add(userId);
        }
        return next;
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    // Members are those who are not editors, editors are separate
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

    // Call the API to update the space with new members
    const updatedSpace = await doUpdateSpace(space, {
      isRestricted: space.isRestricted,
      memberIds,
      editorIds,
      managementMode: "manual",
      name: space.name,
    });

    if (updatedSpace) {
      // Notify parent component to refetch members list
      await onSuccess?.();
      setIsOpen(false);
    }
    setIsSaving(false);
  };

  const handleClose = () => {
    setSearchText("");
    setIsOpen(false);
  };

  // Get selected users data for button label
  const selectedMembersCount = currentMembers.size;
  const saveButtonLabel =
    "Save" + (selectedMembersCount > 0 ? ` (${selectedMembersCount})` : "");

  // Determine if at least one editor is selected
  const selectedEditorsCount = currentEditors.size;

  const canSave = selectedEditorsCount > 0 && !isSaving;

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
            <ListGroup>
              {isLoading ? (
                <div className="flex items-center justify-center p-4">
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Loading users...
                  </span>
                </div>
              ) : (
                members.map((user) => {
                  const isMember = currentMembers.has(user.sId);
                  const isEditor = currentEditors.has(user.sId);
                  return (
                    <ListItem
                      key={user.sId}
                      itemsAlignment="center"
                      onClick={() => toggleUser(user.sId)}
                    >
                      <div className="flex w-full items-center gap-3">
                        <Checkbox
                          checked={isMember}
                          onCheckedChange={(checked) => {
                            if (checked !== "indeterminate") {
                              toggleUser(user.sId);
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        />
                        <Avatar
                          name={user.fullName}
                          visual={user.image}
                          size="sm"
                          isRounded={true}
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-foreground dark:text-foreground-night">
                            {user.fullName}
                          </span>
                          <span className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
                            {user.email}
                          </span>
                        </div>
                      </div>
                      {isMember && isEditor && (
                        <Button
                          size="xs"
                          variant="highlight"
                          label="Editor"
                          icon={CheckIcon}
                          onClick={(e) => {
                            toggleEditor(user.sId);
                            e.stopPropagation();
                          }}
                        />
                      )}
                      {isMember && !isEditor && (
                        <Button
                          size="xs"
                          variant="outline"
                          label="Set as editor"
                          onClick={(e) => {
                            toggleEditor(user.sId);
                            e.stopPropagation();
                          }}
                        />
                      )}
                    </ListItem>
                  );
                })
              )}
            </ListGroup>
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
