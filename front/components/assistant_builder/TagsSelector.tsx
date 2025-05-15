import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PlusIcon,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { useTags } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import { isAdmin, isBuilder } from "@app/types";
import type { TagType } from "@app/types/tag";

import { TagCreationDialog } from "./TagCreationDialog";

export const TagsSelector = ({
  owner,
  builderState,
  setBuilderState,
  setEdited,
  suggestionButton,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  suggestionButton: JSX.Element;
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

  const onTagCreated = (tag: TagType) => {
    setBuilderState((state) => ({
      ...state,
      tags: [...state.tags, tag],
    }));
    setEdited(true);
  };

  return (
    <>
      <TagCreationDialog
        owner={owner}
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        onTagCreated={onTagCreated}
      />
      <div className="mb-2 flex flex-wrap gap-2">
        {assistantTags.map((tag) => (
          <Chip
            key={tag.sId}
            onRemove={
              tag.reserved && !isBuilder(owner)
                ? undefined
                : () => {
                    setBuilderState((state) => ({
                      ...state,
                      tags: state.tags.filter((t) => t.sId !== tag.sId),
                    }));
                    setEdited(true);
                  }
            }
            size="xs"
            color="golden"
            label={tag.name}
          />
        ))}
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
          <DropdownMenuContent
            className="h-96 min-w-72"
            dropdownHeaders={
              <>
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
              </>
            }
          >
            {filteredTags.map((tag) => (
              <DropdownMenuItem
                className="p-1"
                key={tag.sId}
                onClick={() => {
                  setBuilderState((state) => ({
                    ...state,
                    tags: [...state.tags, tag],
                  }));
                  setEdited(true);
                }}
              >
                <Chip size="xs" color="golden" label={tag.name} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {suggestionButton}
      </div>
    </>
  );
};
