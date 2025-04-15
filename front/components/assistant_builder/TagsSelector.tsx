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
  useSendNotification,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { useCreateTag, useTags } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";

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
  // const [error, setError] = useState<string | null>(null);
  const { mutateTags } = useTags({ owner, disabled: true });
  const { addTag } = useCreateTag({ owner });

  const sendNotification = useSendNotification();

  const handleCreateTag = async () => {
    try {
      setName("");
      const response = await addTag(name);
      void mutateTags();
      setBuilderState((state) => ({
        ...state,
        tags: [...state.tags, response.tag],
      }));
      setEdited(true);
    } catch (error) {
      // Handle error
      sendNotification({
        title: "Can't create tag",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
        type: "error",
      });
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
                  id="name"
                  placeholder="Tag name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.length > 0) {
                      void handleCreateTag();
                      setIsOpen(false);
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
            onClick: () => {
              setName("");
            },
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: handleCreateTag,
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

  const assistantTags = builderState.tags || [];
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
            color="golden"
            label={tag.name}
          />
        ))}
      </div>

      <div className="mb-2 flex flex-row gap-2">
        <DropdownMenu open={isMenuOpen} onOpenChange={onMenuOpenChange}>
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
            />
            <DropdownMenuSeparator />
            <ScrollArea className="flex max-h-[300px] flex-col" hideScrollBar>
              {filteredTags.map((c) => (
                <DropdownMenuItem
                  key={`assistant-picker-${c.sId}`}
                  label={c.name}
                  onClick={() => {
                    setBuilderState((state) => ({
                      ...state,
                      tags: [...state.tags, c],
                    }));
                    setEdited(true);
                  }}
                />
              ))}
              <ScrollBar className="py-0" />
            </ScrollArea>
            <DropdownMenuSeparator />
            <div className="flex justify-end p-1">
              <Button
                label="Create"
                size="xs"
                variant="primary"
                icon={PlusIcon}
                onClick={() => {
                  onMenuOpenChange(false);
                  setIsDialogOpen(true);
                }}
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};
