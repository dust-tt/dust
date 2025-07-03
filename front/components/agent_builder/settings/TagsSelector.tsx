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
import { useMemo, useState } from "react";

import { useTags } from "@app/lib/swr/tags";
import { tagsSorter } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";
import { isAdmin, isBuilder } from "@app/types";
import type { TagType } from "@app/types/tag";

import { TagCreationDialog } from "./TagCreationDialog";

interface TagsSelectorProps {
  owner: WorkspaceType;
  tags: TagType[];
  onTagsChange: (tags: TagType[]) => void;
  suggestionButton?: JSX.Element;
}

export const TagsSelector = ({
  owner,
  tags,
  onTagsChange,
  suggestionButton,
}: TagsSelectorProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const { tags: allTags } = useTags({
    owner,
  });

  const onMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
    if (open) {
      setSearchText("");
    }
  };

  const filteredTags = useMemo(() => {
    const currentTagIds = new Set(tags.map((t) => t.sId));
    return allTags
      .filter(
        (t) =>
          !currentTagIds.has(t.sId) &&
          t.name.toLowerCase().includes(searchText.toLowerCase())
      )
      .filter((t) => isBuilder(owner) || t.kind !== "protected")
      .sort(tagsSorter);
  }, [allTags, tags, searchText, owner]);

  const sortedTags = tags.toSorted(tagsSorter);

  const addTag = (tag: TagType) => {
    onTagsChange([...tags, tag]);
  };

  const removeTag = (tagId: string) => {
    onTagsChange(tags.filter((t) => t.sId !== tagId));
  };

  return (
    <>
      <TagCreationDialog
        owner={owner}
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        addTag={addTag}
      />
      <div className="mb-2 flex flex-wrap gap-2">
        {sortedTags.map((tag) => (
          <Chip
            key={tag.sId}
            onRemove={
              tag.kind === "protected" && !isBuilder(owner)
                ? undefined
                : () => removeTag(tag.sId)
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
                      addTag(filteredTags[0]);
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
                    addTag(tag);
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
