import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Plus,
  Tag01,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { type BuilderTag, mockTags } from "./data";

/**
 * A "Tags" row: the selected tags as outlined pills, then a round "+" that
 * opens the picker. The menu lists the selected tags first (checked), then
 * the rest of the workspace tags.
 */
export function TagsPicker({
  tagIds,
  onTagsChange,
}: {
  tagIds: string[];
  onTagsChange: (ids: string[]) => void;
  /** Kept for parity with the product; removal happens through the menu. */
  canPublish?: boolean;
}) {
  const [tagSearch, setTagSearch] = useState("");
  const [customTags, setCustomTags] = useState<BuilderTag[]>([]);

  const allTags = [...mockTags, ...customTags];
  const needle = tagSearch.trim().toLowerCase();
  const matches = (tag: BuilderTag) =>
    !needle || tag.name.toLowerCase().includes(needle);
  const selectedTags = tagIds
    .map((id) => allTags.find((tag) => tag.id === id))
    .filter((tag): tag is BuilderTag => Boolean(tag));
  const selectedInMenu = selectedTags.filter(matches);
  const unselectedInMenu = allTags.filter(
    (tag) => !tagIds.includes(tag.id) && matches(tag)
  );
  const canCreateTag =
    needle.length > 0 &&
    !allTags.some((tag) => tag.name.toLowerCase() === needle);

  const toggleTag = (id: string) =>
    onTagsChange(
      tagIds.includes(id)
        ? tagIds.filter((candidate) => candidate !== id)
        : [...tagIds, id]
    );

  const renderTag = (tag: BuilderTag) => (
    <DropdownMenuCheckboxItem
      key={tag.id}
      label={tag.name}
      checked={tagIds.includes(tag.id)}
      onCheckedChange={() => toggleTag(tag.id)}
      onSelect={(event) => event.preventDefault()}
    />
  );

  return (
    <>
      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (open) {
            setTagSearch("");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            isRounded
            icon={Tag01}
            label={
              selectedTags.length === 0
                ? "Tags"
                : selectedTags.length === 1
                  ? selectedTags[0].name
                  : `${selectedTags.length} tags`
            }
            tooltip="Change or add tags"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuSearchbar
            name="tag-search"
            placeholder="Change or add tags..."
            value={tagSearch}
            onChange={setTagSearch}
            autoFocus
          />
          <DropdownMenuSeparator />
          {selectedInMenu.length > 0 ? (
            <>
              {selectedInMenu.map(renderTag)}
              <DropdownMenuSeparator />
            </>
          ) : null}
          {unselectedInMenu.map(renderTag)}
          {canCreateTag ? (
            <DropdownMenuItem
              icon={Plus}
              label={`Create "${tagSearch.trim()}"`}
              onSelect={() => {
                const tag: BuilderTag = {
                  id: `tag-custom-${Date.now()}`,
                  name: tagSearch.trim(),
                  color: "",
                };
                setCustomTags((prev) => [...prev, tag]);
                onTagsChange([...tagIds, tag.id]);
              }}
            />
          ) : null}
          {selectedInMenu.length === 0 &&
          unselectedInMenu.length === 0 &&
          !canCreateTag ? (
            <DropdownMenuItem label="No matching tags" disabled />
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
