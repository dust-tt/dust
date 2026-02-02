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

import { useSearchMembers } from "@app/lib/swr/memberships";
import type {
  LightWorkspaceType,
  SpaceType,
  SpaceUserType,
  UserType,
} from "@app/types";

interface UserWithMembershipStatus extends UserType {
  isMember: boolean;
  isEditor: boolean;
}

interface ManageUsersPanelProps {
  isOpen: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
  currentProjectMembers: SpaceUserType[];
  onClose: () => void;
  onSave: ({
    members,
    editors,
  }: {
    members: string[];
    editors: string[];
  }) => void;
}

export function ManageUsersPanel({
  isOpen,
  owner,
  space,
  currentProjectMembers: currentProjectMembers,
  onClose,
  onSave,
}: ManageUsersPanelProps) {
  const [searchText, setSearchText] = useState("");

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
  }, [allWorkspaceMembers, currentProjectMembers, isOpen]);

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

  const handleSave = () => {
    onSave({
      members: members
        .filter((m) => m.isMember && !m.isEditor)
        .map((m) => m.sId),
      editors: members
        .filter((m) => m.isMember && m.isEditor)
        .map((m) => m.sId),
    });
  };

  const handleClose = () => {
    setSearchText("");
    onClose();
  };

  // Get selected users data for button label
  const selectedMembersCount = useMemo(() => {
    return members.filter((user) => user.isMember).length;
  }, [members]);
  const selectedEditorsCount = useMemo(() => {
    return members.filter((user) => user.isEditor).length;
  }, [members]);
  const saveButtonLabel =
    "Save" + (selectedMembersCount > 0 ? ` (${selectedMembersCount})` : "");
  const canSave = selectedEditorsCount > 0;

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
              ) : members.length === 0 ? (
                <div className="flex items-center justify-center p-4">
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {searchText.trim()
                      ? "No users found"
                      : "All workspace members are already in this project"}
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
                      className={
                        isSelected
                          ? "bg-primary-50 dark:bg-primary-50-night"
                          : ""
                      }
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
                          size="mini"
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
                          size="mini"
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
            tooltip: !canSave
              ? "Please select at least one editor to save."
              : undefined,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
