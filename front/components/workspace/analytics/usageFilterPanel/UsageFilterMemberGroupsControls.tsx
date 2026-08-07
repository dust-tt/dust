import type { UsageFilterGroup } from "@app/components/workspace/analytics/usageFilter";
import {
  Button,
  Chip,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Plus,
} from "@dust-tt/sparkle";

interface UsageFilterMemberGroupsControlsProps {
  isAddGroupOpen: boolean;
  onToggleAddGroupOpen: () => void;
  availableGroups: UsageFilterGroup[];
  onAddGroup: (group: UsageFilterGroup) => void;
  selectedGroups: UsageFilterGroup[];
  onRemoveGroup: (id: string) => void;
}

export function UsageFilterMemberGroupsControls({
  isAddGroupOpen,
  onToggleAddGroupOpen,
  availableGroups,
  onAddGroup,
  selectedGroups,
  onRemoveGroup,
}: UsageFilterMemberGroupsControlsProps) {
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
            onClick={onToggleAddGroupOpen}
          />
        }
      />
      {isAddGroupOpen && (
        <NavigationList className="max-h-[120px]">
          {availableGroups.length > 0 ? (
            availableGroups.map((group) => (
              <NavigationListItem
                key={group.id}
                avatar={
                  <span className="label-sm grow overflow-hidden text-ellipsis whitespace-nowrap text-gray-950">
                    {group.name}
                  </span>
                }
                onClick={() => onAddGroup(group)}
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
    </>
  );
}
