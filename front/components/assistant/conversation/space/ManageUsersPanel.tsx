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
import { useEffect, useMemo, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { useSpaceInfo, useUpdateSpace } from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";
import type {
  LightWorkspaceType,
  SpaceUserType,
  UserType,
} from "@app/types/user";

interface UserWithMembershipStatus extends UserType {
  isMember: boolean;
  isEditor: boolean;
}

interface ManageUsersPanelProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  owner: LightWorkspaceType;
  space: SpaceType;
  currentProjectMembers: SpaceUserType[];
}

export function ManageUsersPanel({
  isOpen,
  setIsOpen,
  owner,
  space,
  currentProjectMembers: currentProjectMembers,
}: ManageUsersPanelProps) {
  const [searchText, setSearchText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const sendNotification = useSendNotification();
  const doUpdateSpace = useUpdateSpace({ owner });
  const { mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });

  // Fetch workspace members
  const { members: allWorkspaceMembers, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: 0,
    pageSize: 100,
  });

  // Filter out current members from the list
  const [members, setMembers] = useState<UserWithMembershipStatus[]>([]);

  useEffect(() => {
    const currentMemberIds = new Set(currentProjectMembers.map((m) => m.sId));
    const currentEditorIds = new Set(
      currentProjectMembers.filter((m) => m.isEditor).map((m) => m.sId)
    );
    setMembers(
      allWorkspaceMembers.map((member) => ({
        ...member,
        isMember: currentMemberIds.has(member.sId),
        isEditor: currentEditorIds.has(member.sId),
      }))
    );
  }, [
    allWorkspaceMembers,
    currentProjectMembers,
    isOpen, // reset the member list when opening/closing the panel
  ]);

  const toggleUser = (userId: string) => {
    setMembers((prevMembers) =>
      prevMembers.map((member) => {
        if (member.sId === userId) {
          const newIsMember = !member.isMember;
          return {
            ...member,
            isMember: newIsMember,
            // isEditor is always set to false when isMember changes
            isEditor: false,
          };
        }
        return member;
      })
    );
  };

  const toggleEditor = (userId: string) => {
    setMembers((prevMembers) =>
      prevMembers.map((member) => {
        if (member.sId === userId && member.isMember) {
          return {
            ...member,
            isEditor: !member.isEditor,
          };
        }
        return member;
      })
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Preserve existing members/editors who weren't loaded in the members list
    const loadedMemberIds = new Set(members.map((m) => m.sId));
    const unloadedMembers = currentProjectMembers
      .filter((m) => !loadedMemberIds.has(m.sId))
      .map((m) => m.sId);
    const unloadedEditors = currentProjectMembers
      .filter((m) => !loadedMemberIds.has(m.sId) && m.isEditor)
      .map((m) => m.sId);

    // Add loaded members that are selected
    const loadedMembersToSave = members
      .filter((m) => m.isMember && !m.isEditor)
      .map((m) => m.sId);
    const loadedEditorsToSave = members
      .filter((m) => m.isMember && m.isEditor)
      .map((m) => m.sId);

    const memberIds = [...unloadedMembers, ...loadedMembersToSave];
    const editorIds = [...unloadedEditors, ...loadedEditorsToSave];

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
      // Trigger a refresh of the space info to get updated members list
      await mutateSpaceInfo();
      setIsOpen(false);
    }
    setIsSaving(false);
  };

  const handleClose = () => {
    setSearchText("");
    setIsOpen(false);
  };

  // Get selected users data for button label
  const selectedMembersCount = useMemo(() => {
    return members.filter((user) => user.isMember).length;
  }, [members]);
  const saveButtonLabel =
    "Save" + (selectedMembersCount > 0 ? ` (${selectedMembersCount})` : "");

  // Determine if at least one editor is selected (can't save otherwise)
  const selectedEditorsCount = useMemo(() => {
    return members.filter((user) => user.isEditor).length;
  }, [members]);
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
                members.map((user: UserWithMembershipStatus) => {
                  const isSelected = user.isMember;
                  return (
                    <ListItem
                      key={user.sId}
                      itemsAlignment="center"
                      onClick={() => toggleUser(user.sId)}
                    >
                      <div className="flex w-full items-center gap-3">
                        <Checkbox
                          checked={isSelected}
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
                      {user.isMember && user.isEditor && (
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
                      {user.isMember && !user.isEditor && (
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
