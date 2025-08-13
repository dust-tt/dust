import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
  PlusIcon,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

import { TagCreationDialog } from "@app/components/agent_builder/settings/TagCreationDialog";
import { useAssistantBuilderContext } from "@app/components/assistant_builder/contexts/AssistantBuilderContexts";
import { useTags } from "@app/lib/swr/tags";
import { tagsSorter } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";
import { isAdmin, isBuilder } from "@app/types";
import type { TagType } from "@app/types/tag";

export const TagsSelector = ({
  owner,
  suggestionButton,
}: {
  owner: WorkspaceType;
  suggestionButton: JSX.Element;
}) => {
  const { builderState, setBuilderState, setEdited } =
    useAssistantBuilderContext();

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
    return tags
      .filter(
        (t) =>
          !currentTagIds.has(t.sId) &&
          t.name.toLowerCase().includes(searchText.toLowerCase())
      )
      .filter((t) => isBuilder(owner) || t.kind !== "protected")
      .sort(tagsSorter);
  }, [tags, builderState.tags, searchText, owner]);

  const assistantTags = [...(builderState.tags || [])].sort(tagsSorter);

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
        addTag={onTagCreated}
      />
      <div className="mb-2 flex flex-wrap gap-2">
        {assistantTags.map((tag) => (
          <Chip
            key={tag.sId}
            onRemove={
              tag.kind === "protected" && !isBuilder(owner)
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
            className="h-96 w-96"
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
            <DropdownMenuTagList>
              {filteredTags.map((tag) => (
                <DropdownMenuTagItem
                  color="golden"
                  key={tag.sId}
                  label={tag.name}
                  onClick={() => {
                    setBuilderState((state) => ({
                      ...state,
                      tags: [...state.tags, tag],
                    }));
                    setEdited(true);
                  }}
                />
              ))}
            </DropdownMenuTagList>
          </DropdownMenuContent>
        </DropdownMenu>
        {suggestionButton}
      </div>
    </>
  );
};
