import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/shared/filter_panel/filterState";
import {
  Button,
  ChevronDown,
  ChevronRight,
  Collapsible,
  CollapsibleContent,
  cn,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  XClose,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
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
  className?: string;
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
  className,
}: FilterSelectionSummaryProps<Category, Option>) {
  const { t } = useLingui();
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
    <div className={cn("flex h-full w-52 flex-col p-2", className)}>
      <NavigationListLabel
        className="bg-transparent pt-1.5 font-medium"
        label={t`${plural(selectionCount, {
          one: "# filter selected",
          other: "# filters selected",
        })}`}
      />
      <NavigationList className="min-h-0 flex-1">
        {categoriesWithSelection.length > 0 &&
          categoriesWithSelection.map((category) => {
            const isCategoryOpen = !collapsedCategories.has(category);
            const categoryLabel = categoryLabels[category];
            const selectedCount = filter[category]?.length ?? 0;
            return (
              <div key={category}>
                <NavigationListLabel
                  className="bg-transparent font-medium"
                  label={t`${categoryLabel} (${selectedCount})`}
                  action={
                    <div className="flex items-center gap-1">
                      <Button
                        label={t({
                          message: "Clear",
                          context: "clear a filter",
                        })}
                        size="xmini"
                        variant="ghost-secondary"
                        onClick={() => onClearCategory(category)}
                      />
                      <Button
                        icon={isCategoryOpen ? ChevronDown : ChevronRight}
                        size="xmini"
                        variant="ghost"
                        tooltip={isCategoryOpen ? t`Collapse` : t`Expand`}
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
