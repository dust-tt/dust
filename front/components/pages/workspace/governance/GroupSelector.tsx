import type { GroupType } from "@app/types/groups";
import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Plus,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface GroupSelectorProps {
  selectedGroups: GroupType[];
  selectableGroups: GroupType[];
  onSelectionChange: (groupIds: string[]) => void;
}

export const GroupSelector = ({
  selectedGroups,
  selectableGroups,
  onSelectionChange,
}: GroupSelectorProps) => {
  const [groupSearch, setGroupSearch] = useState("");
  const filteredGroups = selectableGroups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const selectedGroupIds = selectedGroups.map((g) => g.sId);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            icon={Plus}
            label="Add a group"
            isSelect
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[320px]" collisionPadding={8}>
          <DropdownMenuSearchbar
            name="group-search"
            placeholder="Search groups"
            value={groupSearch}
            onChange={setGroupSearch}
            autoFocus
          />
          {filteredGroups.map((group) => (
            <DropdownMenuItem
              key={group.sId}
              label={group.name}
              endComponent={
                <Chip
                  label={
                    group.kind === "provisioned" ? "Provisioned" : "Manual"
                  }
                  color={group.kind === "provisioned" ? "primary" : "highlight"}
                  size="xs"
                />
              }
              onClick={() =>
                onSelectionChange([...selectedGroupIds, group.sId])
              }
            />
          ))}
          {filteredGroups.length === 0 && (
            <DropdownMenuItem
              label={groupSearch ? "No groups found" : "All groups added"}
              disabled
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {selectedGroups.map((group) => (
        <span key={group.sId}>
          <Chip
            label={group.name}
            size="xs"
            color="highlight"
            onRemove={() =>
              onSelectionChange(
                selectedGroupIds.filter((id) => id !== group.sId)
              )
            }
          />
        </span>
      ))}
    </div>
  );
};
