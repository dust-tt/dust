import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  TagIcon,
} from "@dust-tt/sparkle";
import { DropdownMenuTagItem } from "@dust-tt/sparkle";
import { DropdownMenuTagList } from "@dust-tt/sparkle";
import { useState } from "react";

import { compareForFuzzySort, subFilter, tagsSorter } from "@app/lib/utils";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";

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
      if (tagSearch) {
        return compareForFuzzySort(
          tagSearch,
          a.name.toLowerCase(),
          b.name.toLowerCase()
        );
      } else {
        return tagsSorter(a, b);
      }
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
            variant="outline"
            icon={TagIcon}
            label="Tags"
            counterValue={selectedTags.length.toString()}
            isCounter={selectedTags.length > 0}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-96"
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
          {filteredTags.length === 0 && (
            <div className="flex items-center justify-center py-4 text-sm">
              No tags found
            </div>
          )}
          <DropdownMenuTagList>
            {filteredTags
              .filter((tag) => !selectedTags.includes(tag))
              .map((tag) => (
                <DropdownMenuTagItem
                  key={tag.sId}
                  label={tag.name}
                  color="golden"
                  className="m-0.5"
                  onClick={() => {
                    setSelectedTags([...selectedTags, tag]);
                  }}
                />
              ))}
          </DropdownMenuTagList>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
