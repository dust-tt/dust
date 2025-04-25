import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  TagIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";
import type { TagType } from "@app/types/tag";

import { TagsManager } from "./TagsManager";

type TagsFilterMenuProps = {
  tags: TagType[];
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  owner: WorkspaceType;
};

export const TagsFilterMenu = ({
  tags,
  selectedTags,
  setSelectedTags,
  owner,
}: TagsFilterMenuProps) => {
  const [isTagManagerOpen, setTagManagerOpen] = useState(false);
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState<string>("");

  const filteredTags = tags
    .filter((a) => {
      return subFilter(tagSearch, a.name.toLowerCase());
    })
    .sort((a, b) => {
      return compareForFuzzySort(
        tagSearch,
        a.name.toLowerCase(),
        b.name.toLowerCase()
      );
    });

  return (
    <>
      <TagsManager
        open={isTagManagerOpen}
        setOpen={setTagManagerOpen}
        owner={owner}
      />
      <DropdownMenu open={isDropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            icon={TagIcon}
            label={
              selectedTags.length > 0 ? `Tags (${selectedTags.length})` : "Tags"
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          dropdownHeaders={
            <DropdownMenuSearchbar
              name="tagSearch"
              placeholder="Search tags"
              value={tagSearch}
              onChange={setTagSearch}
              button={
                <Button
                  variant="primary"
                  label="Manage tags"
                  onClick={() => {
                    setDropdownOpen(false);
                    setTagManagerOpen(true);
                  }}
                />
              }
            />
          }
        >
          {filteredTags.map((tag) => (
            <DropdownMenuCheckboxItem
              key={tag.sId}
              checked={selectedTags.includes(tag.sId)}
              onCheckedChange={(checked) => {
                if (checked) {
                  setSelectedTags([...selectedTags, tag.sId]);
                } else {
                  setSelectedTags(selectedTags.filter((t) => t !== tag.sId));
                }
              }}
            >
              {tag.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
