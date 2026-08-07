import type { UsageFilterGroup } from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterGroup,
  removeUsageFilterGroup,
} from "@app/components/workspace/analytics/usageFilter";
import {
  Button,
  Chip,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Plus,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface UsageFilterMemberGroupsControlsProps {
  groups: UsageFilterGroup[];
}

export function UsageFilterMemberGroupsControls({
  groups,
}: UsageFilterMemberGroupsControlsProps) {
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<UsageFilterGroup[]>([]);

  const availableGroups = useMemo(
    () =>
      groups.filter(
        (group) => !selectedGroups.some((selected) => selected.id === group.id)
      ),
    [groups, selectedGroups]
  );

  const handleAddGroup = (group: UsageFilterGroup) => {
    setSelectedGroups((current) => addUsageFilterGroup(current, group));
    setIsAddGroupOpen(false);
  };

  const handleRemoveGroup = (id: string) => {
    setSelectedGroups((current) => removeUsageFilterGroup(current, id));
  };

  return (
    <>
      <NavigationListLabel
        label="Groups"
        className="bg-transparent font-medium"
        action={
          <Button
            label="Add group"
            icon={Plus}
            size="xmini"
            variant="ghost-secondary"
            onClick={() => setIsAddGroupOpen((current) => !current)}
          />
        }
      />
      {isAddGroupOpen && (
        <NavigationList className="max-h-32">
          {availableGroups.length > 0 ? (
            availableGroups.map((group) => (
              <NavigationListItem
                key={group.id}
                avatar={
                  <span className="label-sm grow overflow-hidden text-ellipsis whitespace-nowrap text-gray-950">
                    {group.name}
                  </span>
                }
                onClick={() => handleAddGroup(group)}
              />
            ))
          ) : (
            <div className="flex items-center p-2 text-sm text-muted-foreground">
              No more groups
            </div>
          )}
        </NavigationList>
      )}
      {selectedGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedGroups.map((group) => (
            <Chip
              key={group.id}
              label={group.name}
              size="xs"
              onRemove={() => handleRemoveGroup(group.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
