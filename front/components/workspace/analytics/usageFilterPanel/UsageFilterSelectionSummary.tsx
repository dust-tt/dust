import type {
  UsageFilter,
  UsageFilterCategory,
} from "@app/components/workspace/analytics/usageFilter";
import { USAGE_FILTER_CATEGORY_LABEL } from "@app/components/workspace/analytics/usageFilter";
import { UsageFilterEntityIcon } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterEntityIcon";
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
import { useState } from "react";

interface UsageFilterSelectionSummaryProps {
  categoriesWithSelection: UsageFilterCategory[];
  draftFilter: UsageFilter;
  onClearCategory: (category: UsageFilterCategory) => void;
  onRemoveEntity: (category: UsageFilterCategory, id: string) => void;
}

export function UsageFilterSelectionSummary({
  categoriesWithSelection,
  draftFilter,
  onClearCategory,
  onRemoveEntity,
}: UsageFilterSelectionSummaryProps) {
  // Sections are open by default; a category lands here once the user
  // collapses it.
  const [collapsedCategories, setCollapsedCategories] = useState<
    Set<UsageFilterCategory>
  >(new Set());

  const handleToggleCategoryOpen = (category: UsageFilterCategory) => {
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
    (total, category) => total + (draftFilter[category]?.length ?? 0),
    0
  );

  return (
    <div className="flex h-full w-[200px] flex-col p-2">
      <NavigationListLabel
        className="bg-transparent pt-1.5 font-medium"
        label={`${selectionCount} filter${selectionCount === 1 ? "" : "s"} selected`}
      />
      <NavigationList className="min-h-0 flex-1">
        {categoriesWithSelection.length > 0 ? (
          categoriesWithSelection.map((category) => {
            const isCategoryOpen = !collapsedCategories.has(category);
            return (
              <div key={category}>
                <NavigationListLabel
                  className="bg-transparent font-medium"
                  label={`${USAGE_FILTER_CATEGORY_LABEL[category]} (${draftFilter[category]?.length ?? 0})`}
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
                    {(draftFilter[category] ?? []).map((entity) => (
                      <NavigationListItem
                        key={`${category}:${entity.id}`}
                        avatar={
                          <div className="flex grow items-center gap-2 overflow-hidden">
                            <UsageFilterEntityIcon entity={entity} />
                            <span className="label-sm overflow-hidden text-ellipsis whitespace-nowrap text-gray-950">
                              {entity.name}
                            </span>
                          </div>
                        }
                        suffix={
                          <Button
                            icon={XClose}
                            size="xmini"
                            variant="ghost"
                            onClick={() => onRemoveEntity(category, entity.id)}
                          />
                        }
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })
        ) : (
          <div className="flex items-center p-2 text-sm text-muted-foreground">
            No filters selected
          </div>
        )}
      </NavigationList>
    </div>
  );
}
