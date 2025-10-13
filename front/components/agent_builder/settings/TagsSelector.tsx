import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";

import { useCreateTag, useTags } from "@app/lib/swr/tags";
import { tagsSorter } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";
import { isAdmin, isBuilder } from "@app/types";
import type { TagType } from "@app/types/tag";

interface TagsSelectorProps {
  owner: WorkspaceType;
  tags: TagType[];
  onAddTag: (tag: TagType) => void;
  onRemoveTag: (tagId: string) => void;
  onSuggestTags?: () => Promise<TagType[]>;
  isSuggestLoading?: boolean;
  isSuggestDisabled?: boolean;
  instructions?: string;
}

export const TagsSelector = ({
  owner,
  tags,
  onAddTag,
  onRemoveTag,
  onSuggestTags,
  isSuggestLoading,
  isSuggestDisabled,
  instructions,
}: TagsSelectorProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<TagType[]>([]);
  const [lastSuggestedInstructions, setLastSuggestedInstructions] = useState<
    string | undefined
  >(undefined);

  const { tags: allTags } = useTags({
    owner,
  });
  const { createTag } = useCreateTag({ owner });

  const onMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
    if (open) {
      setSearchText("");
      const shouldTriggerSuggestions =
        onSuggestTags &&
        !isSuggestDisabled &&
        instructions &&
        instructions !== lastSuggestedInstructions;

      if (shouldTriggerSuggestions) {
        void triggerSuggestions();
      }
    }
  };

  const triggerSuggestions = async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    if (!onSuggestTags || isSuggestLoading || !instructions) {
      return;
    }

    try {
      const suggestions = await onSuggestTags();
      setSuggestedTags(suggestions);
      setLastSuggestedInstructions(instructions);
    } catch (error) {
      setSuggestedTags([]);
      setLastSuggestedInstructions(instructions);
    }
  };

  const { suggestedFilteredTags, otherFilteredTags } = useMemo(() => {
    const suggestedTagIds = new Set(suggestedTags.map((t) => t.sId));

    const allFiltered = allTags
      .filter((t) => t.name.toLowerCase().includes(searchText.toLowerCase()))
      .filter((t) => isBuilder(owner) || t.kind !== "protected")
      .sort(tagsSorter);

    const suggested = allFiltered.filter((t) => suggestedTagIds.has(t.sId));
    return {
      suggestedFilteredTags: suggested,
      otherFilteredTags: allFiltered,
    };
  }, [suggestedTags, allTags, searchText, owner]);

  const exactMatch = allTags.find(
    (t) => t.name.toLowerCase() === searchText.toLowerCase()
  );
  const showCreateOption =
    isAdmin(owner) && searchText.trim() !== "" && !exactMatch;

  const handleCreateTag = async (tagName: string) => {
    const newTag = await createTag(tagName);
    if (newTag) {
      onAddTag(newTag);
      setSearchText("");
      setIsMenuOpen(false);
    }
  };

  const sortedTags = tags.toSorted(tagsSorter);

  const onKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();

      if (showCreateOption) {
        await handleCreateTag(searchText.trim());
      } else {
        const allAvailable = [...suggestedFilteredTags, ...otherFilteredTags];
        if (allAvailable.length > 0) {
          onAddTag(allAvailable[0]);
        }
      }
    }
  };

  return (
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
              size="sm"
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
              onKeyDown={onKeyDown}
            />
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-auto">
              {showCreateOption && (
                <DropdownMenuItem
                  label={`Create "${searchText.trim()}"`}
                  icon={PlusIcon}
                  onClick={() => handleCreateTag(searchText.trim())}
                />
              )}

              {(suggestedFilteredTags.length > 0 || isSuggestLoading) && (
                <>
                  <DropdownMenuLabel>
                    <div className="flex items-center gap-2">
                      {isSuggestLoading && <Spinner size="xs" />}
                      {isSuggestLoading
                        ? "Generating suggestions..."
                        : "Suggested tags"}
                    </div>
                  </DropdownMenuLabel>
                  {suggestedFilteredTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag.sId}
                      label={tag.name}
                      checked={tags.some((t) => t.sId === tag.sId)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onAddTag(tag);
                        } else {
                          onRemoveTag(tag.sId);
                        }
                      }}
                      onSelect={(event) => {
                        event.preventDefault();
                      }}
                    />
                  ))}
                </>
              )}

              {otherFilteredTags.length > 0 && (
                <>
                  {(suggestedFilteredTags.length > 0 || isSuggestLoading) && (
                    <DropdownMenuSeparator />
                  )}
                  <DropdownMenuLabel>Other tags</DropdownMenuLabel>
                  {otherFilteredTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag.sId}
                      label={tag.name}
                      checked={tags.some((t) => t.sId === tag.sId)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onAddTag(tag);
                        } else {
                          onRemoveTag(tag.sId);
                        }
                      }}
                      onSelect={(event) => {
                        event.preventDefault();
                      }}
                    />
                  ))}
                </>
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
  );
};
