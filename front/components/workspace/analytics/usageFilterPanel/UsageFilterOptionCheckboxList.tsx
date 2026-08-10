import type {
  UsageFilterCategory,
  UsageFilterOption,
} from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterOptionIcon } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterOptionIcon";
import {
  Button,
  Checkbox,
  Label,
  NavigationList,
  NavigationListLabel,
} from "@dust-tt/sparkle";

interface UsageFilterOptionCheckboxListProps {
  category: UsageFilterCategory;
  categoryLabel: string;
  options: UsageFilterOption[];
  selectedIds: Set<string>;
  onToggleOption: (option: UsageFilterOption) => void;
  onSelectAll: () => void;
}

export function UsageFilterOptionCheckboxList({
  category,
  categoryLabel,
  options,
  selectedIds,
  onToggleOption,
  onSelectAll,
}: UsageFilterOptionCheckboxListProps) {
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
            disabled={options.length === 0}
          />
        }
      />
      <NavigationList className="min-h-0 flex-1">
        {options.length > 0 ? (
          options.map((option) => {
            const checked = selectedIds.has(option.id);
            const checkboxId = `usage-filter-option-${category}-${option.id}`;
            return (
              <div
                key={option.id}
                className="flex items-center gap-2 py-1 pl-1 pr-2"
              >
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  onCheckedChange={() => onToggleOption(option)}
                />
                <UsageFilterOptionIcon option={option} />
                <Label
                  htmlFor={checkboxId}
                  className="cursor-pointer text-sm leading-none"
                >
                  {option.name}
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
