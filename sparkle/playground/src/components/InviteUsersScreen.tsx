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
import { useMemo, useState } from "react";

import type { User } from "../data";
import { getSpaceById } from "../data/spaces";
import { mockUsers } from "../data/users";

interface InviteUsersScreenProps {
  isOpen: boolean;
  spaceId: string | null;
  onClose: () => void;
  onInvite: (selectedUserIds: string[]) => void;
}

export function InviteUsersScreen({
  isOpen,
  spaceId,
  onClose,
  onInvite,
}: InviteUsersScreenProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set()
  );
  const [searchText, setSearchText] = useState("");

  const space = spaceId ? getSpaceById(spaceId) : null;
  const spaceName = space?.name || "this room";

  // Filter users based on search text
  const filteredUsers = useMemo(() => {
    if (!searchText.trim()) {
      return mockUsers;
    }
    const lowerSearch = searchText.toLowerCase();
    return mockUsers.filter(
      (user) =>
        user.fullName.toLowerCase().includes(lowerSearch) ||
        user.email.toLowerCase().includes(lowerSearch)
    );
  }, [searchText]);

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
    return mockUsers.filter((user) => selectedUserIds.has(user.id));
  }, [selectedUserIds]);

  const selectedCount = selectedUsers.length;
  const inviteButtonLabel =
    selectedCount > 0 ? `Invite (${selectedCount})` : "Invite";
  const inviteButtonTooltip =
    selectedCount > 0
      ? selectedUsers.map((user) => user.fullName).join(", ")
      : undefined;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent size="lg" side="right">
        <SheetHeader>
          <SheetTitle>Invite users to {spaceName}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="s-flex s-flex-col s-gap-4">
            <p className="s-text-sm s-text-muted-foreground">
              Select users to invite to this room.
            </p>
            <SearchInput
              name="user-search"
              value={searchText}
              onChange={setSearchText}
              placeholder="Search users..."
              className="s-w-full"
            />
            <div className="s-flex s-flex-1 s-flex-col s-min-h-0">
              <ListGroup>
                {filteredUsers.map((user) => {
                  const isSelected = selectedUserIds.has(user.id);
                  return (
                    <ListItem
                      key={user.id}
                      interactive={true}
                      itemsAlignment="center"
                      onClick={() => toggleUser(user.id)}
                      className={
                        isSelected
                          ? "s-bg-primary-50 dark:s-bg-primary-50-night"
                          : ""
                      }
                    >
                      <Avatar
                        name={user.fullName}
                        visual={user.portrait}
                        size="sm"
                        isRounded={true}
                      />
                      <div className="s-flex s-flex-1 s-flex-col s-min-w-0">
                        <span className="s-text-sm s-font-medium s-text-foreground s-truncate">
                          {user.fullName}
                        </span>
                        <span className="s-text-xs s-text-muted-foreground s-truncate">
                          {user.email}
                        </span>
                      </div>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked !== "indeterminate") {
                            handleCheckboxChange(user.id, checked);
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      />
                    </ListItem>
                  );
                })}
              </ListGroup>
            </div>
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
            variant: "primary",
            onClick: handleInvite,
            tooltip: inviteButtonTooltip,
            disabled: selectedCount === 0,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
