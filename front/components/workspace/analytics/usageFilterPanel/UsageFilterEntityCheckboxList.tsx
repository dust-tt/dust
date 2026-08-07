import type {
  UsageFilterCategory,
  UsageFilterEntity,
} from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterEntityIcon } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterEntityIcon";
import {
  Button,
  Checkbox,
  Label,
  NavigationList,
  NavigationListLabel,
} from "@dust-tt/sparkle";

interface UsageFilterEntityCheckboxListProps {
  category: UsageFilterCategory;
  categoryLabel: string;
  entities: UsageFilterEntity[];
  selectedIds: Set<string>;
  onToggleEntity: (entity: UsageFilterEntity) => void;
  onSelectAll: () => void;
}

export function UsageFilterEntityCheckboxList({
  category,
  categoryLabel,
  entities,
  selectedIds,
  onToggleEntity,
  onSelectAll,
}: UsageFilterEntityCheckboxListProps) {
  return (
    <>
      <NavigationListLabel
        label={`All ${categoryLabel}`}
        className="bg-transparent font-medium"
        action={
          <Button
            label="Select all"
            size="xmini"
            variant="ghost-secondary"
            onClick={onSelectAll}
            disabled={entities.length === 0}
          />
        }
      />
      <NavigationList className="min-h-0 flex-1">
        {entities.length > 0 ? (
          entities.map((entity) => {
            const checked = selectedIds.has(entity.id);
            const checkboxId = `usage-filter-entity-${category}-${entity.id}`;
            return (
              <div
                key={entity.id}
                className="flex items-center gap-2 py-1 pl-1 pr-2"
              >
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  onCheckedChange={() => onToggleEntity(entity)}
                />
                <UsageFilterEntityIcon category={category} entity={entity} />
                <Label
                  htmlFor={checkboxId}
                  className="cursor-pointer text-sm leading-none"
                >
                  {entity.name}
                </Label>
              </div>
            );
          })
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No results
          </div>
        )}
      </NavigationList>
    </>
  );
}
