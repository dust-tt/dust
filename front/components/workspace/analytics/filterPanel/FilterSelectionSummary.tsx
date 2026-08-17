import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/workspace/analytics/filterPanel/filterState";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  Button,
  ChevronDown,
  ChevronRight,
  Collapsible,
  CollapsibleContent,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  XClose,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useState } from "react";

interface FilterSelectionSummaryProps<
  Category extends string,
  Option extends FilterOptionBase,
> {
  categoriesWithSelection: Category[];
  categoryLabels: Record<Category, string>;
  filter: CategoryFilter<Category, Option>;
  onClearCategory: (category: Category) => void;
  onRemoveOption: (category: Category, id: string) => void;
  renderIcon?: (option: Option) => ReactNode;
}

export function FilterSelectionSummary<
  Category extends string,
  Option extends FilterOptionBase,
>({
  categoriesWithSelection,
  categoryLabels,
  filter,
  onClearCategory,
  onRemoveOption,
  renderIcon,
}: FilterSelectionSummaryProps<Category, Option>) {
  // Sections are open by default; a category lands here once the user
  // collapses it.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(
    new Set()
  );

  const handleToggleCategoryOpen = (category: Category) => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const selectionCount = categoriesWithSelection.reduce(
    (total, category) => total + (filter[category]?.length ?? 0),
    0
  );

  return (
    <div className="flex h-full w-52 flex-col p-2">
      <NavigationListLabel
        className="bg-transparent pt-1.5 font-medium"
        label={`${selectionCount} filter${pluralize(selectionCount)} selected`}
      />
      <NavigationList className="min-h-0 flex-1">
        {categoriesWithSelection.length > 0 &&
          categoriesWithSelection.map((category) => {
            const isCategoryOpen = !collapsedCategories.has(category);
            return (
              <div key={category}>
                <NavigationListLabel
                  className="bg-transparent font-medium"
                  label={`${categoryLabels[category]} (${filter[category]?.length ?? 0})`}
                  action={
                    <div className="flex items-center gap-1">
                      <Button
                        label="Clear"
                        size="xmini"
                        variant="ghost-secondary"
                        onClick={() => onClearCategory(category)}
                      />
                      <Button
                        icon={isCategoryOpen ? ChevronDown : ChevronRight}
                        size="xmini"
                        variant="ghost"
                        tooltip={isCategoryOpen ? "Collapse" : "Expand"}
                        onClick={() => handleToggleCategoryOpen(category)}
                      />
                    </div>
                  }
                />
                <Collapsible open={isCategoryOpen}>
                  <CollapsibleContent>
                    {(filter[category] ?? []).map((option) => (
                      <NavigationListItem
                        key={`${category}:${option.id}`}
                        avatar={
                          <div className="flex grow items-center gap-2 overflow-hidden">
                            {renderIcon?.(option)}
                            <span className="label-sm overflow-hidden text-ellipsis whitespace-nowrap primary-dark">
                              {option.name}
                            </span>
                          </div>
                        }
                        suffix={
                          <Button
                            icon={XClose}
                            size="xmini"
                            variant="ghost"
                            onClick={() => onRemoveOption(category, option.id)}
                          />
                        }
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })}
      </NavigationList>
    </div>
  );
}
