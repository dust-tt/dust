import type { UsageFilterGroup } from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterSection } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterSection";
import {
  Button,
  Chip,
  NavigationList,
  NavigationListItem,
  Plus,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface UsageFilterMemberGroupsControlsProps {
  groups: UsageFilterGroup[];
  selectedGroups: UsageFilterGroup[];
  onAddGroup: (group: UsageFilterGroup) => void;
  onRemoveGroup: (id: string) => void;
}

export function UsageFilterMemberGroupsControls({
  groups,
  selectedGroups,
  onAddGroup,
  onRemoveGroup,
}: UsageFilterMemberGroupsControlsProps) {
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);

  const availableGroups = groups.filter(
    (group) => !selectedGroups.some((selected) => selected.id === group.id)
  );

  const handleAddGroup = (group: UsageFilterGroup) => {
    onAddGroup(group);
    setIsAddGroupOpen(false);
  };

  return (
    <UsageFilterSection
      title="Groups"
      action={
        <Button
          label="Add group"
          icon={Plus}
          size="xmini"
          variant="ghost-secondary"
          onClick={() => setIsAddGroupOpen((current) => !current)}
        />
      }
    >
      {isAddGroupOpen && (
        <NavigationList className="max-h-32">
          {availableGroups.length > 0 ? (
            availableGroups.map((group) => (
              <NavigationListItem
                key={group.id}
                avatar={
                  <span className="label-sm grow overflow-hidden text-ellipsis whitespace-nowrap primary-dark">
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
              onRemove={() => onRemoveGroup(group.id)}
            />
          ))}
        </div>
      )}
    </UsageFilterSection>
  );
}
