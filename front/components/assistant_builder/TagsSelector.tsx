import {
  Button,
  Chip,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  PlusIcon,
  ScrollArea,
  ScrollBar,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { useCreateTag, useTags } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import { isAdmin } from "@app/types";

const MAX_TAG_LENGTH = 100;

const TagCreationDialog = ({
  owner,
  isOpen,
  setIsOpen,
  setBuilderState,
  setEdited,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
}) => {
  const [name, setName] = useState("");
  const { createTag } = useCreateTag({ owner });

  // const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
    }
  }, [isOpen]);

  const handleCreateTag = async () => {
    const tag = await createTag(name);
    if (tag) {
      setBuilderState((state) => ({
        ...state,
        tags: [...state.tags, tag],
      }));
      setEdited(true);
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add tag</DialogTitle>
          <DialogDescription>
            Create a new tag for your assistant
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <div className="flex space-x-2">
              <div className="flex-grow">
                <Input
                  maxLength={MAX_TAG_LENGTH}
                  id="name"
                  placeholder="Tag name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.length > 0) {
                      void handleCreateTag();
                    }
                  }}
                  autoFocus
                />
              </div>
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "ghost",
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: handleCreateTag,
            disabled: name.length === 0,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export const TagsSelector = ({
  owner,
  builderState,
  setBuilderState,
  setEdited,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const { tags } = useTags({
    owner,
  });

  const onMenuOpenChange = useCallback((open: boolean) => {
    setIsMenuOpen(open);
    if (open) {
      setSearchText("");
    }
  }, []);

  const filteredTags = useMemo(() => {
    const currentTagIds = new Set(builderState.tags.map((t) => t.sId));
    return tags.filter(
      (t) =>
        !currentTagIds.has(t.sId) &&
        t.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [tags, builderState.tags, searchText]);

  const assistantTags = [...(builderState.tags || [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  return (
    <>
      <TagCreationDialog
        owner={owner}
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        builderState={builderState}
        setBuilderState={setBuilderState}
        setEdited={setEdited}
      />
      <div className="mb-2 flex flex-wrap gap-2">
        {assistantTags.map((tag) => (
          <Chip
            key={tag.sId}
            onRemove={() => {
              setBuilderState((state) => ({
                ...state,
                tags: state.tags.filter((t) => t.sId !== tag.sId),
              }));
              setEdited(true);
            }}
            size="sm"
            color="golden"
            label={tag.name}
          />
        ))}
      </div>

      <div className="mb-2 flex flex-row gap-2">
        <DropdownMenu
          open={isMenuOpen}
          onOpenChange={onMenuOpenChange}
          modal={false}
        >
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              icon={PlusIcon}
              variant="outline"
              label="Add"
              isSelect
              tooltip="Select a tag"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[300px]">
            <DropdownMenuSearchbar
              autoFocus
              placeholder="Search"
              name="input"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredTags.length > 0) {
                  setBuilderState((state) => ({
                    ...state,
                    tags: [...state.tags, filteredTags[0]],
                  }));
                  setEdited(true);
                  onMenuOpenChange(false);
                }
              }}
              button={
                isAdmin(owner) ? (
                  <Button
                    label="Create"
                    variant="primary"
                    icon={PlusIcon}
                    onClick={() => {
                      onMenuOpenChange(false);
                      setIsDialogOpen(true);
                    }}
                  />
                ) : undefined
              }
            />
            <DropdownMenuSeparator />
            <ScrollArea className="flex max-h-[300px] flex-col" hideScrollBar>
              {filteredTags.map((c) => (
                <DropdownMenuItem
                  className="p-[4px]"
                  key={`assistant-picker-${c.sId}`}
                  onClick={() => {
                    setBuilderState((state) => ({
                      ...state,
                      tags: [...state.tags, c],
                    }));
                    setEdited(true);
                  }}
                >
                  <Chip size="sm" color="golden" label={c.name} />
                </DropdownMenuItem>
              ))}
              <ScrollBar className="py-0" />
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};
