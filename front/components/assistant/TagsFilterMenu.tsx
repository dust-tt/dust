import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  TagIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type { WorkspaceType } from "@app/types";
import { isAdmin } from "@app/types";
import type { TagType } from "@app/types/tag";

import { TagsManager } from "./TagsManager";

type TagsFilterMenuProps = {
  tags: TagType[];
  selectedTags: TagType[];
  setSelectedTags: (tags: TagType[]) => void;
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
            label={"Tags"}
            counterValue={selectedTags.length.toString()}
            isCounter={selectedTags.length > 0}
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
                isAdmin(owner) ? (
                  <Button
                    variant="primary"
                    label="Manage tags"
                    onClick={() => {
                      setDropdownOpen(false);
                      setTagManagerOpen(true);
                    }}
                  />
                ) : undefined
              }
            />
          }
        >
          {filteredTags
            .filter((tag) => !selectedTags.includes(tag))
            .map((tag) => (
              <DropdownMenuItem
                key={tag.sId}
                onClick={() => {
                  setSelectedTags([...selectedTags, tag]);
                }}
              >
                <Chip label={tag.name} size="xs" color="golden" />
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
