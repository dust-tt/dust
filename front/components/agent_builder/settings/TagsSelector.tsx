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
  SparklesIcon,
  Spinner,
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
  onAddTag: (tag: TagType) => void;
  onRemoveTag: (tagId: string) => void;
  onSuggestTags?: () => Promise<void>;
  isSuggestLoading?: boolean;
  isSuggestDisabled?: boolean;
  suggestTooltip?: string;
}

export const TagsSelector = ({
  owner,
  tags,
  onAddTag,
  onRemoveTag,
  onSuggestTags,
  isSuggestLoading,
  isSuggestDisabled,
  suggestTooltip,
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

  return (
    <>
      <TagCreationDialog
        owner={owner}
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        addTag={onAddTag}
      />
      <div className="space-y-2">
        <div className="flex gap-2">
          <DropdownMenu
            open={isMenuOpen}
            onOpenChange={onMenuOpenChange}
            modal={false}
          >
            <DropdownMenuTrigger asChild>
              <Button
                icon={PlusIcon}
                variant="outline"
                label="Add"
                isSelect
                tooltip="Select a tag"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="h-96 w-96" side="top" align="start">
              <div className="flex h-full flex-col">
                <div className="flex-shrink-0">
                  <DropdownMenuSearchbar
                    autoFocus
                    placeholder="Search"
                    name="input"
                    value={searchText}
                    onChange={setSearchText}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && filteredTags.length > 0) {
                        onAddTag(filteredTags[0]);
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
                </div>
                <div className="flex-1 overflow-auto">
                  <DropdownMenuTagList>
                    {filteredTags.map((tag) => (
                      <DropdownMenuTagItem
                        color="golden"
                        key={tag.sId}
                        label={tag.name}
                        onClick={() => {
                          onAddTag(tag);
                        }}
                      />
                    ))}
                  </DropdownMenuTagList>
                </div>
                {onSuggestTags && (
                  <div className="flex w-full flex-shrink-0 flex-row items-end justify-end">
                    <div className="px-2 py-2">
                      <Button
                        icon={
                          isSuggestLoading
                            ? () => <Spinner size="xs" />
                            : SparklesIcon
                        }
                        variant="outline"
                        size="xs"
                        disabled={isSuggestDisabled}
                        tooltip={suggestTooltip}
                        onClick={async () => {
                          await onSuggestTags();
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {sortedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortedTags.map((tag) => (
              <Chip
                key={tag.sId}
                onRemove={
                  tag.kind === "protected" && !isBuilder(owner)
                    ? undefined
                    : () => onRemoveTag(tag.sId)
                }
                size="xs"
                color="golden"
                label={tag.name}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
};
