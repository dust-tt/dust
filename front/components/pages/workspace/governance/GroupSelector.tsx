import { GroupDialog } from "@app/components/groups/GroupDialog";
import { getGroupKindChip } from "@app/components/groups/GroupKinds";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import type { GroupType } from "@app/types/groups";
import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Plus,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface GroupSelectorProps {
  selectedGroups: GroupType[];
  selectableGroups: GroupType[];
  disabled?: boolean;
  onSelectionChange: (groupIds: string[]) => void;
}

export const GroupSelector = ({
  selectedGroups,
  selectableGroups,
  disabled,
  onSelectionChange,
}: GroupSelectorProps) => {
  const owner = useWorkspace();
  const [groupSearch, setGroupSearch] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const filteredGroups = selectableGroups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const selectedGroupIds = selectedGroups.map((g) => g.sId);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) {
            setGroupSearch("");
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="animate-in fade-in duration-75"
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
              disabled={disabled}
              endComponent={
                <Chip {...getGroupKindChip(group.kind)} size="xs" />
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            icon={Plus}
            label="Create a group"
            disabled={disabled}
            onClick={() => setIsCreateDialogOpen(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {selectedGroups.map((group) => (
        <Chip
          key={group.sId}
          className="animate-in fade-in duration-75"
          label={group.name}
          size="xs"
          color="highlight"
          onRemove={() => {
            if (disabled) {
              return;
            }
            onSelectionChange(
              selectedGroupIds.filter((id) => id !== group.sId)
            );
          }}
        />
      ))}
      <GroupDialog
        owner={owner}
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreated={(group) =>
          onSelectionChange([...selectedGroupIds, group.sId])
        }
      />
    </div>
  );
};
