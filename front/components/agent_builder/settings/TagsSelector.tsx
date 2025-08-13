import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
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

  const currentTagIds = new Set(tags.map((t) => t.sId));

  const filteredTags = useMemo(() => {
    return allTags
      .filter((t) => t.name.toLowerCase().includes(searchText.toLowerCase()))
      .filter((t) => isBuilder(owner) || t.kind !== "protected")
      .sort(tagsSorter);
  }, [allTags, searchText, owner]);

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
            <DropdownMenuContent className="w-96" side="top" align="start">
              <DropdownMenuSearchbar
                autoFocus
                placeholder="Choose an option"
                name="input"
                value={searchText}
                onChange={setSearchText}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredTags.length > 0) {
                    const firstUnselected = filteredTags.find(
                      (tag) => !currentTagIds.has(tag.sId)
                    );
                    if (firstUnselected) {
                      onAddTag(firstUnselected);
                    }
                  }
                }}
              />
              <DropdownMenuSeparator />
              <div className="max-h-80 overflow-auto">
                {filteredTags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag.sId}
                    label={tag.name}
                    checked={currentTagIds.has(tag.sId)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onAddTag(tag);
                      } else {
                        onRemoveTag(tag.sId);
                      }
                    }}
                  />
                ))}
              </div>
              {(isAdmin(owner) || onSuggestTags) && (
                <>
                  <DropdownMenuSeparator />
                  <div className="flex gap-2 p-2">
                    {isAdmin(owner) && (
                      <Button
                        label="Create new tag"
                        variant="outline"
                        icon={PlusIcon}
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          onMenuOpenChange(false);
                          setIsDialogOpen(true);
                        }}
                      />
                    )}
                    {onSuggestTags && (
                      <Button
                        icon={
                          isSuggestLoading
                            ? () => <Spinner size="xs" />
                            : SparklesIcon
                        }
                        variant="outline"
                        size="sm"
                        disabled={isSuggestDisabled}
                        tooltip={suggestTooltip}
                        onClick={async () => {
                          await onSuggestTags();
                        }}
                      />
                    )}
                  </div>
                </>
              )}
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
