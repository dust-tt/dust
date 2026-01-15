import {
  Avatar,
  Checkbox,
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

interface InviteUsersPanelProps {
  isOpen: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
  currentMembers: SpaceUserType[];
  onClose: () => void;
  onInvite: (selectedUserIds: string[]) => void;
  title?: string;
  actionLabel?: string;
  initialSelectedUserIds?: string[];
}

export function InviteUsersPanel({
  isOpen,
  owner,
  space,
  currentMembers,
  onClose,
  onInvite,
  title,
  actionLabel = "Invite",
  initialSelectedUserIds,
}: InviteUsersPanelProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set()
  );
  const [searchText, setSearchText] = useState("");

  const spaceName = space.name || "this room";
  const resolvedTitle = title ?? `Invite Members to ${spaceName}`;

  // Initialize with initial selections only (not current members)
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const additionalIds = initialSelectedUserIds ?? [];
    setSelectedUserIds(new Set(additionalIds));
  }, [initialSelectedUserIds, isOpen]);

  // Fetch workspace members
  const { members: allMembers, isLoading } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: searchText,
    pageIndex: 0,
    pageSize: 100,
  });

  // Filter out current members from the list
  const members = useMemo(() => {
    const currentMemberIds = new Set(currentMembers.map((m) => m.sId));
    return allMembers.filter((member) => !currentMemberIds.has(member.sId));
  }, [allMembers, currentMembers]);

  const toggleUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleInvite = () => {
    onInvite(Array.from(selectedUserIds));
    setSelectedUserIds(new Set());
  };

  const handleClose = () => {
    setSelectedUserIds(new Set());
    setSearchText("");
    onClose();
  };

  const handleCheckboxChange = (userId: string, checked: boolean) => {
    const newSelected = new Set(selectedUserIds);
    if (checked) {
      newSelected.add(userId);
    } else {
      newSelected.delete(userId);
    }
    setSelectedUserIds(newSelected);
  };

  // Get selected users data for button label and tooltip
  const selectedUsers = useMemo(() => {
    return members.filter((user) => selectedUserIds.has(user.sId));
  }, [members, selectedUserIds]);

  const selectedCount = selectedUsers.length;
  const inviteButtonLabel =
    selectedCount > 0 ? `${actionLabel} (${selectedCount})` : actionLabel;
  const inviteButtonTooltip =
    selectedCount > 0
      ? selectedUsers.map((user) => user.fullName).join(", ")
      : undefined;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent size="lg" side="right">
        <SheetHeader>
          <SheetTitle>{resolvedTitle}</SheetTitle>
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
                members.map((user: UserType) => {
                  const isSelected = selectedUserIds.has(user.sId);
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
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked !== "indeterminate") {
                            handleCheckboxChange(user.sId, checked);
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      />
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
            label: inviteButtonLabel,
            variant: "highlight",
            onClick: handleInvite,
            tooltip: inviteButtonTooltip,
            disabled: selectedCount === 0,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
