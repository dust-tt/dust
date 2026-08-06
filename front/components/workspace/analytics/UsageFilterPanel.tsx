import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type {
  UsageFilter,
  UsageFilterCategory,
  UsageFilterEntity,
  UsageFilterGroup,
  UsageFilterScope,
  UsageModelLab,
  UsageModelTier,
} from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterGroup,
  clearUsageFilterCategory,
  removeUsageFilterEntity,
  removeUsageFilterGroup,
  selectAllUsageFilterEntities,
  toggleUsageFilterEntity,
  USAGE_FILTER_CATEGORIES,
  USAGE_FILTER_CATEGORY_LABEL,
  USAGE_FILTER_SCOPE_LABEL,
  USAGE_FILTER_SCOPES,
  USAGE_MODEL_LABS,
  USAGE_MODEL_TIER_LABEL,
  USAGE_MODEL_TIERS,
} from "@app/components/workspace/analytics/usageFilter";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { useSearchMembers } from "@app/lib/swr/memberships";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  BarFull,
  BarHalf,
  BarLow,
  Button,
  Check,
  Checkbox,
  ChevronDown,
  ChevronRight,
  Chip,
  Collapsible,
  CollapsibleContent,
  Counter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  FilterFunnel01,
  Icon,
  Label,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
  Plus,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SearchInput,
  XClose,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { Fragment, useMemo, useState } from "react";

const MODEL_TIER_ICON: Record<UsageModelTier, ComponentType> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};

interface UsageFilterPanelProps {
  owner: LightWorkspaceType;
  // Agents/models/tools/skills/sources are still mock data (see
  // usageFilterMockData.ts — sources are fake connectors standing in for a
  // real db call); members are fetched live below (useSearchMembers).
  categoryEntities: Record<
    "agent" | "model" | "tool" | "skill" | "source",
    UsageFilterEntity[]
  >;
  groups: UsageFilterGroup[];
  filter: UsageFilter;
  onFilterChange: (next: UsageFilter) => void;
}

export function UsageFilterPanel({
  owner,
  categoryEntities,
  groups,
  filter,
  onFilterChange,
}: UsageFilterPanelProps) {
  const { isDark } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  // Selections are staged here while the panel is open and only propagated to
  // `onFilterChange` when the user clicks Apply. Cancel (or dismissing the
  // popover any other way) simply drops the draft: it gets re-synced from
  // `filter` the next time the panel opens.
  const [draftFilter, setDraftFilter] = useState<UsageFilter>(filter);
  const [activeCategory, setActiveCategory] =
    useState<UsageFilterCategory>("agent");
  const [activeScope, setActiveScope] = useState<UsageFilterScope>(
    USAGE_FILTER_SCOPES[0]
  );
  const [activeTier, setActiveTier] = useState<UsageModelTier>(
    USAGE_MODEL_TIERS[0]
  );
  const [searchText, setSearchText] = useState("");
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [isMoreModelsOpen, setIsMoreModelsOpen] = useState(false);
  const [moreModelsSearch, setMoreModelsSearch] = useState("");
  // "More models" opens collapsed to just the maker rows; picking one expands
  // its model list. Cleared whenever the dropdown re-opens.
  const [expandedModelLab, setExpandedModelLab] =
    useState<UsageModelLab | null>(null);
  // Only used for the "member" category: narrows the displayed members down
  // to those belonging to at least one of these groups. Not currently backed
  // by real group-membership data (the search endpoint has no such concept
  // yet), so it's UI-only until that exists.
  const [selectedGroups, setSelectedGroups] = useState<UsageFilterGroup[]>([]);
  // Sections are open by default; a category lands here once the user
  // collapses it.
  const [collapsedCategories, setCollapsedCategories] = useState<
    Set<UsageFilterCategory>
  >(new Set());

  const { members } = useSearchMembers({
    workspaceId: owner.sId,
    searchTerm: activeCategory === "member" ? searchText : "",
    pageIndex: 0,
    pageSize: 100,
    disabled: !isOpen || activeCategory !== "member",
  });

  const memberEntities = useMemo(
    () => members.map((m) => ({ id: m.sId, name: m.fullName, image: m.image })),
    [members]
  );

  const resolvedCategoryEntities = useMemo<
    Record<UsageFilterCategory, UsageFilterEntity[]>
  >(
    () => ({
      ...categoryEntities,
      member: memberEntities,
    }),
    [categoryEntities, memberEntities]
  );

  const activeEntities = resolvedCategoryEntities[activeCategory];
  const filteredEntities = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return activeEntities.filter((entity) => {
      if (activeCategory === "agent" && entity.scope !== activeScope) {
        return false;
      }
      if (activeCategory === "model" && entity.tier !== activeTier) {
        return false;
      }
      if (search && !entity.name.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });
  }, [activeEntities, searchText, activeScope, activeTier, activeCategory]);

  // "More models" browses every model grouped by maker, independent of the
  // Fast/Standard/Complex quick filter above. Groups start collapsed to just
  // their maker row; a search bypasses grouping entirely and lists matches
  // flat, mirroring the message composer's model picker.
  const moreModelsQuery = moreModelsSearch.trim().toLowerCase();
  const isSearchingMoreModels = moreModelsQuery !== "";

  const moreModelsSearchResults = useMemo(
    () =>
      isSearchingMoreModels
        ? categoryEntities.model.filter((entity) =>
            entity.name.toLowerCase().includes(moreModelsQuery)
          )
        : [],
    [categoryEntities, isSearchingMoreModels, moreModelsQuery]
  );

  const moreModelsGroups = useMemo(
    () =>
      USAGE_MODEL_LABS.flatMap((lab) => {
        const models = categoryEntities.model.filter(
          (entity) => entity.lab === lab
        );
        return models.length > 0 ? [{ lab, models }] : [];
      }),
    [categoryEntities]
  );

  const availableGroups = useMemo(
    () =>
      groups.filter(
        (group) => !selectedGroups.some((selected) => selected.id === group.id)
      ),
    [groups, selectedGroups]
  );

  const selectedIdsForActiveCategory = useMemo(
    () =>
      new Set((draftFilter[activeCategory] ?? []).map((entity) => entity.id)),
    [draftFilter, activeCategory]
  );

  const appliedSelectionCount = useMemo(
    () =>
      USAGE_FILTER_CATEGORIES.reduce(
        (count, category) => count + (filter[category]?.length ?? 0),
        0
      ),
    [filter]
  );

  const categoriesWithSelection = useMemo(
    () =>
      USAGE_FILTER_CATEGORIES.filter(
        (category) => (draftFilter[category]?.length ?? 0) > 0
      ),
    [draftFilter]
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setDraftFilter(filter);
      setSearchText("");
      setIsAddGroupOpen(false);
      setIsMoreModelsOpen(false);
    }
  };

  const handleCategoryChange = (category: UsageFilterCategory) => {
    setActiveCategory(category);
    setSearchText("");
    setIsAddGroupOpen(false);
    setIsMoreModelsOpen(false);
  };

  const handleAddGroup = (group: UsageFilterGroup) => {
    setSelectedGroups((current) => addUsageFilterGroup(current, group));
    setIsAddGroupOpen(false);
  };

  const handleRemoveGroup = (id: string) => {
    setSelectedGroups((current) => removeUsageFilterGroup(current, id));
  };

  const handleClearActiveCategory = () => {
    setDraftFilter(clearUsageFilterCategory(draftFilter, activeCategory));
  };

  const handleClearCategory = (category: UsageFilterCategory) => {
    setDraftFilter(clearUsageFilterCategory(draftFilter, category));
  };

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

  const handleSelectAllFiltered = () => {
    setDraftFilter(
      selectAllUsageFilterEntities(
        draftFilter,
        activeCategory,
        filteredEntities
      )
    );
  };

  const handleClearAll = () => {
    setDraftFilter({});
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleApply = () => {
    onFilterChange(draftFilter);
    setIsOpen(false);
  };

  const activeCategorySelectionCount = draftFilter[activeCategory]?.length ?? 0;

  const renderEntityIcon = (
    category: UsageFilterCategory,
    entity: UsageFilterEntity
  ) => {
    if (category === "member") {
      return (
        <Avatar
          name={entity.name}
          visual={entity.image ?? undefined}
          size="xxs"
          isRounded
        />
      );
    }
    if (category === "source") {
      const logo = getConnectorProviderLogoWithFallback({
        provider: entity.connectorProvider ?? null,
        isDark,
      });
      return <Icon visual={logo} size="sm" />;
    }
    if (category === "model" && entity.lab) {
      return <Icon visual={getModelMakerLogo(entity.lab, isDark)} size="sm" />;
    }
    return null;
  };

  return (
    <PopoverRoot open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          icon={FilterFunnel01}
          size="xs"
          variant="outline"
          isCounter={appliedSelectionCount > 0}
          counterValue={String(appliedSelectionCount)}
          tooltip="Filter"
        />
      </PopoverTrigger>
      <PopoverContent
        fullWidth
        align="start"
        className="w-auto rounded-2xl p-0"
      >
        <div className="flex h-[420px] flex-row divide-x divide-border">
          <div className="flex h-full w-[170px] flex-col p-2">
            <NavigationListLabel
              label="Filter"
              className="bg-transparent pt-1.5 font-medium"
            />
            <NavigationList className="min-h-0 flex-1">
              {USAGE_FILTER_CATEGORIES.map((category) => {
                const selectionCount = draftFilter[category]?.length ?? 0;
                return (
                  <NavigationListItem
                    key={category}
                    selected={category === activeCategory}
                    avatar={
                      <span className="label-sm grow overflow-hidden text-ellipsis whitespace-nowrap text-gray-950">
                        {USAGE_FILTER_CATEGORY_LABEL[category]}
                      </span>
                    }
                    suffix={
                      selectionCount > 0 ? (
                        <Counter
                          value={selectionCount}
                          size="xs"
                          variant="highlight"
                        />
                      ) : undefined
                    }
                    onClick={() => handleCategoryChange(category)}
                  />
                );
              })}
            </NavigationList>
          </div>
          <div className="flex h-full w-[300px] flex-col gap-2 p-2">
            <NavigationListLabel
              label={USAGE_FILTER_CATEGORY_LABEL[activeCategory]}
              className="bg-transparent pt-1.5 pb-0 font-medium"
              action={
                <Button
                  label="Clear"
                  size="xmini"
                  variant="ghost-secondary"
                  onClick={handleClearActiveCategory}
                  disabled={activeCategorySelectionCount === 0}
                  className={
                    activeCategorySelectionCount === 0 ? "invisible" : undefined
                  }
                />
              }
            />
            <SearchInput
              name="usage-filter-search"
              value={searchText}
              onChange={setSearchText}
              placeholder={`Search ${USAGE_FILTER_CATEGORY_LABEL[activeCategory].toLowerCase()}`}
            />
            {activeCategory === "member" && (
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
            )}
            {activeCategory === "model" && (
              <>
                <NavigationListLabel
                  label="Complexity"
                  className="bg-transparent font-medium"
                  action={
                    <DropdownMenu
                      open={isMoreModelsOpen}
                      onOpenChange={(open) => {
                        setIsMoreModelsOpen(open);
                        if (open) {
                          setMoreModelsSearch("");
                          setExpandedModelLab(null);
                        }
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          label="More models"
                          size="xmini"
                          variant="ghost-secondary"
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuSearchbar
                          name="usage-filter-more-models-search"
                          placeholder="Search for model"
                          value={moreModelsSearch}
                          onChange={setMoreModelsSearch}
                        />
                        {isSearchingMoreModels ? (
                          moreModelsSearchResults.length > 0 ? (
                            moreModelsSearchResults.map((model) => (
                              <DropdownMenuItem
                                key={model.id}
                                label={model.name}
                                icon={
                                  model.lab
                                    ? getModelMakerLogo(model.lab, isDark)
                                    : undefined
                                }
                                endComponent={
                                  selectedIdsForActiveCategory.has(model.id) ? (
                                    <Icon
                                      visual={Check}
                                      size="sm"
                                      className="text-muted-foreground"
                                    />
                                  ) : undefined
                                }
                                onClick={() =>
                                  setDraftFilter(
                                    toggleUsageFilterEntity(
                                      draftFilter,
                                      "model",
                                      model
                                    )
                                  )
                                }
                                onSelect={(e) => e.preventDefault()}
                              />
                            ))
                          ) : (
                            <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                              No models found
                            </div>
                          )
                        ) : (
                          moreModelsGroups.map(({ lab, models }) => (
                            <Fragment key={lab}>
                              <DropdownMenuItem
                                label={getModelMakerDisplayName(lab)}
                                icon={getModelMakerLogo(lab, isDark)}
                                endComponent={
                                  <Icon
                                    visual={
                                      expandedModelLab === lab
                                        ? ChevronDown
                                        : ChevronRight
                                    }
                                    size="xs"
                                  />
                                }
                                onClick={() =>
                                  setExpandedModelLab((current) =>
                                    current === lab ? null : lab
                                  )
                                }
                                onSelect={(e) => e.preventDefault()}
                              />
                              {expandedModelLab === lab &&
                                models.map((model) => (
                                  <DropdownMenuItem
                                    key={model.id}
                                    label={model.name}
                                    className="pl-8"
                                    endComponent={
                                      selectedIdsForActiveCategory.has(
                                        model.id
                                      ) ? (
                                        <Icon
                                          visual={Check}
                                          size="sm"
                                          className="text-muted-foreground"
                                        />
                                      ) : undefined
                                    }
                                    onClick={() =>
                                      setDraftFilter(
                                        toggleUsageFilterEntity(
                                          draftFilter,
                                          "model",
                                          model
                                        )
                                      )
                                    }
                                    onSelect={(e) => e.preventDefault()}
                                  />
                                ))}
                            </Fragment>
                          ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
                <div className="flex items-center gap-1">
                  {USAGE_MODEL_TIERS.map((tier) => (
                    <Button
                      key={tier}
                      label={USAGE_MODEL_TIER_LABEL[tier]}
                      icon={MODEL_TIER_ICON[tier]}
                      size="xs"
                      variant={activeTier === tier ? "primary" : "outline"}
                      onClick={() => setActiveTier(tier)}
                    />
                  ))}
                </div>
              </>
            )}
            {activeCategory === "agent" && (
              <>
                <NavigationListLabel
                  label="Scopes"
                  className="bg-transparent font-medium"
                />
                <div className="flex items-center gap-1">
                  {USAGE_FILTER_SCOPES.map((scope) => (
                    <Button
                      key={scope}
                      label={USAGE_FILTER_SCOPE_LABEL[scope]}
                      size="xs"
                      variant={activeScope === scope ? "primary" : "outline"}
                      onClick={() => setActiveScope(scope)}
                    />
                  ))}
                </div>
              </>
            )}
            <NavigationListLabel
              label={`All ${USAGE_FILTER_CATEGORY_LABEL[activeCategory]}`}
              className="bg-transparent font-medium"
              action={
                <Button
                  label="Select all"
                  size="xmini"
                  variant="ghost-secondary"
                  onClick={handleSelectAllFiltered}
                  disabled={filteredEntities.length === 0}
                />
              }
            />
            <NavigationList className="min-h-0 flex-1">
              {filteredEntities.length > 0 ? (
                filteredEntities.map((entity) => {
                  const checked = selectedIdsForActiveCategory.has(entity.id);
                  const checkboxId = `usage-filter-entity-${activeCategory}-${entity.id}`;
                  const onCheckedChange = () =>
                    setDraftFilter(
                      toggleUsageFilterEntity(
                        draftFilter,
                        activeCategory,
                        entity
                      )
                    );
                  return (
                    <div
                      key={entity.id}
                      className="flex items-center gap-2 py-1 pl-1 pr-2"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        onCheckedChange={onCheckedChange}
                      />
                      {renderEntityIcon(activeCategory, entity)}
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
          </div>
          <div className="flex h-full w-[200px] flex-col p-2">
            <NavigationListLabel
              className="bg-transparent pt-1.5 font-medium"
              label={(() => {
                const count = categoriesWithSelection.reduce(
                  (total, category) =>
                    total + (draftFilter[category]?.length ?? 0),
                  0
                );
                return `${count} filter${count === 1 ? "" : "s"} selected`;
              })()}
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
                              onClick={() => handleClearCategory(category)}
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
                                  {renderEntityIcon(category, entity)}
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
                                  onClick={() =>
                                    setDraftFilter(
                                      removeUsageFilterEntity(
                                        draftFilter,
                                        category,
                                        entity.id
                                      )
                                    )
                                  }
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
        </div>
        <div className="flex items-center justify-between border-t border-border p-2">
          <Button
            label="Clear filters"
            size="xmini"
            variant="ghost-secondary"
            onClick={handleClearAll}
          />
          <div className="flex items-center gap-2">
            <Button
              label="Cancel"
              size="sm"
              variant="outline"
              onClick={handleCancel}
            />
            <Button
              label="Apply"
              size="sm"
              variant="highlight"
              onClick={handleApply}
            />
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
