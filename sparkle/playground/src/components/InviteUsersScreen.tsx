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

import type { User } from "../data";
import { getSpaceById } from "../data/spaces";
import { mockUsers } from "../data/users";

interface InviteUsersScreenProps {
  isOpen: boolean;
  spaceId: string | null;
  onClose: () => void;
  onInvite: (selectedUserIds: string[], editorUserIds: string[]) => void;
  title?: string;
  actionLabel?: string;
  initialSelectedUserIds?: string[];
  initialEditorUserIds?: string[];
  hasMultipleSelect?: boolean;
}

export function InviteUsersScreen({
  isOpen,
  spaceId,
  onClose,
  onInvite,
  title,
  actionLabel = "Invite",
  initialSelectedUserIds,
  initialEditorUserIds,
  hasMultipleSelect = false,
}: InviteUsersScreenProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set()
  );
  const [editorUserIds, setEditorUserIds] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");

  const space = spaceId ? getSpaceById(spaceId) : null;
  const spaceName = space?.name || "this room";
  const resolvedTitle = title ?? `Invite Members to ${spaceName}`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const initialSelection = initialSelectedUserIds ?? [];
    setSelectedUserIds(new Set(initialSelection));
    if (hasMultipleSelect) {
      const initialEditors = new Set(initialEditorUserIds ?? []);
      const filteredEditors = Array.from(initialEditors).filter((userId) =>
        initialSelection.includes(userId)
      );
      setEditorUserIds(new Set(filteredEditors));
    } else {
      setEditorUserIds(new Set());
    }
  }, [initialSelectedUserIds, initialEditorUserIds, isOpen, hasMultipleSelect]);

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
      if (editorUserIds.has(userId)) {
        const nextEditors = new Set(editorUserIds);
        nextEditors.delete(userId);
        setEditorUserIds(nextEditors);
      }
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleInvite = () => {
    onInvite(Array.from(selectedUserIds), Array.from(editorUserIds));
    setSelectedUserIds(new Set());
    setEditorUserIds(new Set());
  };

  const handleClose = () => {
    setSelectedUserIds(new Set());
    setEditorUserIds(new Set());
    setSearchText("");
    onClose();
  };

  const handleCheckboxChange = (userId: string, checked: boolean) => {
    const newSelected = new Set(selectedUserIds);
    if (checked) {
      newSelected.add(userId);
    } else {
      newSelected.delete(userId);
      if (editorUserIds.has(userId)) {
        const nextEditors = new Set(editorUserIds);
        nextEditors.delete(userId);
        setEditorUserIds(nextEditors);
      }
    }
    setSelectedUserIds(newSelected);
  };

  const toggleEditor = (userId: string) => {
    const nextEditors = new Set(editorUserIds);
    if (nextEditors.has(userId)) {
      nextEditors.delete(userId);
    } else {
      nextEditors.add(userId);
    }
    setEditorUserIds(nextEditors);
  };

  // Get selected users data for button label and tooltip
  const selectedUsers = useMemo(() => {
    return mockUsers.filter((user) => selectedUserIds.has(user.id));
  }, [selectedUserIds]);

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
            className="s-mt-2"
          />
          <div className="s-flex s-min-h-0 s-flex-1 s-flex-col">
            <ListGroup>
              {filteredUsers.map((user) => {
                const isSelected = selectedUserIds.has(user.id);

                return (
                  <ListItem
                    key={user.id}
                    itemsAlignment="center"
                    onClick={() => toggleUser(user.id)}
                    ignorePressSelector=".button-class"
                  >
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
                    <Avatar
                      name={user.fullName}
                      visual={user.portrait}
                      size="sm"
                      isRounded={true}
                    />
                    <div className="s-flex s-min-w-0 s-flex-1 s-flex-col">
                      <span className="s-truncate s-text-sm s-font-medium s-text-foreground">
                        {user.fullName}
                      </span>
                      <span className="s-truncate s-text-xs s-text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                    {hasMultipleSelect && isSelected && (
                      <Button
                        size="xs"
                        className="button-class"
                        variant={
                          editorUserIds.has(user.id) ? "highlight" : "outline"
                        }
                        label={
                          editorUserIds.has(user.id)
                            ? "Editor"
                            : "Set as editor"
                        }
                        icon={
                          editorUserIds.has(user.id) ? CheckIcon : undefined
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleEditor(user.id);
                        }}
                      />
                    )}
                  </ListItem>
                );
              })}
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
