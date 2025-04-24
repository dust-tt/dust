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
import type { TagType } from "@app/types/tag";

type TagsMenuProps = {
  uniqueTags: TagType[];
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
};

export const TagsMenu = ({
  uniqueTags,
  selectedTags,
  setSelectedTags,
}: TagsMenuProps) => {
  const [tagSearch, setTagSearch] = useState<string>("");

  const filteredTags = uniqueTags
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
    <DropdownMenu>
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
            button={<Button disabled variant="primary" label="Manage tags" />}
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
  );
};
