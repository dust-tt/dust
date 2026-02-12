import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  PlusIcon,
} from "@dust-tt/sparkle";
import { UserGroupIcon } from "@dust-tt/sparkle";
import React, { useCallback, useMemo, useState } from "react";

import { useGroups } from "@app/lib/swr/groups";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";

interface SearchGroupsDropdownProps {
  owner: LightWorkspaceType;
  selectedGroups: GroupType[];
  onGroupsUpdated: (groups: GroupType[]) => void;
}

export function SearchGroupsDropdown({
  owner,
  selectedGroups,
  onGroupsUpdated,
}: SearchGroupsDropdownProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: ["provisioned"],
  });

  const filteredGroups = useMemo(() => {
    if (!groups) {
      return [];
    }
    const selectedGroupIds = new Set(selectedGroups.map((g) => g.sId));
    return groups.filter(
      (group) =>
        !selectedGroupIds.has(group.sId) &&
        group.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [groups, searchTerm, selectedGroups]);

  const addGroup = useCallback(
    (group: GroupType) => () => {
      onGroupsUpdated([...selectedGroups, group]);
    },
    [selectedGroups, onGroupsUpdated]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button label="Add groups" icon={PlusIcon} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80"
        dropdownHeaders={
          <DropdownMenuSearchbar
            value={searchTerm}
            onChange={setSearchTerm}
            name="search"
            placeholder="Search groups"
          />
        }
      >
        {filteredGroups.map((group) => (
          <DropdownMenuItem
            key={group.sId}
            onClick={addGroup(group)}
            icon={UserGroupIcon}
            label={group.name}
            description={`${group.memberCount} members`}
          />
        ))}
        {filteredGroups.length === 0 && !isGroupsLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {searchTerm ? "No groups found" : "No provisioned groups available"}
          </div>
        )}
        {isGroupsLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading groups...
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
