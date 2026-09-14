import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  FilterLines,
  XClose,
} from "@dust-tt/sparkle";
import { type ComponentType, Fragment, type ReactNode, useState } from "react";

import { getAgentById } from "../data/agents";
import { getUserById } from "../data/users";

export interface FilterOption {
  value: string;
  label: string;
  icon?: ComponentType<{ className?: string }> | ReactNode;
}

/** A category to filter by — the menu shows one submenu per group. */
export interface FilterGroup {
  /** Names the category in the selection, e.g. "type" or "member". */
  kind: string;
  label: string;
  /** Icon on the group's entry in the menu. */
  icon?: ComponentType<{ className?: string }>;
  options: FilterOption[];
}

/**
 * Only one thing is filtered at a time, so a list holds a single selection
 * rather than a filter per category.
 */
export type FilterSelection = { kind: string; value: string } | null;

/** A switch that stands on its own, outside the one-at-a-time selection. */
export interface FilterToggle {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

interface FilterMenuProps {
  groups: FilterGroup[];
  filter: FilterSelection;
  onFilterChange: (filter: FilterSelection) => void;
  toggles?: FilterToggle[];
  /** Names the menu's own search field, which is not the list's search. */
  searchName: string;
  searchPlaceholder: string;
}

/**
 * One filter at a time, picked from one menu: a category to drill into, or a
 * search that reaches across every category at once.
 */
export function FilterMenu({
  groups,
  filter,
  onFilterChange,
  toggles = [],
  searchName,
  searchPlaceholder,
}: FilterMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const populatedGroups = groups.filter((group) => group.options.length > 0);

  const query = search.trim().toLowerCase();
  const matchingGroups = query
    ? populatedGroups
        .map((group) => ({
          ...group,
          options: group.options.filter((option) =>
            option.label.toLowerCase().includes(query)
          ),
        }))
        .filter((group) => group.options.length > 0)
    : [];

  const activeLabel = filter
    ? populatedGroups
        .find((group) => group.kind === filter.kind)
        ?.options.find((option) => option.value === filter.value)?.label
    : undefined;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearch("");
    }
  };

  const select = (next: FilterSelection) => {
    onFilterChange(next);
    handleOpenChange(false);
  };

  const renderOptions = (kind: string, options: FilterOption[]) =>
    options.map((option) => (
      <DropdownMenuItem
        key={`${kind}-${option.value}`}
        label={option.label}
        icon={option.icon}
        onClick={() => select({ kind, value: option.value })}
      />
    ));

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          icon={FilterLines}
          // The icon alone until something is filtered, when the button says
          // what it is filtering by.
          label={activeLabel}
          tooltip={activeLabel ?? "Filter"}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        // The menu is as tall as what it holds, up to a cap the search scrolls
        // within, rather than the fixed height a header otherwise imposes.
        className="h-auto max-h-96 w-auto min-w-[240px] max-w-[320px] xs:h-auto"
        dropdownHeaders={
          <>
            {filter && (
              <>
                <DropdownMenuItem
                  icon={XClose}
                  label="Clear filtering"
                  onClick={() => select(null)}
                />
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuSearchbar
              autoFocus
              name={searchName}
              placeholder={searchPlaceholder}
              value={search}
              onChange={setSearch}
            />
          </>
        }
      >
        {query ? (
          <>
            {matchingGroups.map((group) => (
              <Fragment key={group.kind}>
                <DropdownMenuLabel label={group.label} />
                {renderOptions(group.kind, group.options)}
              </Fragment>
            ))}
            {matchingGroups.length === 0 && (
              <div className="flex h-16 items-center justify-center px-3 text-sm text-muted-foreground">
                No match
              </div>
            )}
          </>
        ) : (
          populatedGroups.map((group) => (
            <DropdownMenuSub key={group.kind}>
              <DropdownMenuSubTrigger label={group.label} icon={group.icon} />
              <DropdownMenuSubContent>
                {renderOptions(group.kind, group.options)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        )}
        {toggles.length > 0 && !query && (
          <>
            <DropdownMenuSeparator />
            {toggles.map((toggle) => (
              <DropdownMenuCheckboxItem
                key={toggle.id}
                label={toggle.label}
                checked={toggle.checked}
                // Flipping a switch is not picking a filter, so the menu stays
                // open and several can be set in one visit.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={toggle.onChange}
              />
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Dedupe a list of user ids into filter options, sorted by name. */
export function collectUsers(ids: (string | undefined)[]): FilterOption[] {
  const seen = new Set<string>();
  const options: FilterOption[] = [];

  for (const id of ids) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const user = getUserById(id);
    if (!user) {
      continue;
    }
    options.push({
      value: id,
      label: user.fullName,
      icon: (
        <Avatar
          name={user.fullName}
          visual={user.portrait}
          size="xs"
          isRounded
        />
      ),
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

/** Dedupe a list of agent ids into filter options, sorted by name. */
export function collectAgents(ids: (string | undefined)[]): FilterOption[] {
  const seen = new Set<string>();
  const options: FilterOption[] = [];

  for (const id of ids) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const agent = getAgentById(id);
    if (!agent) {
      continue;
    }
    options.push({
      value: id,
      label: agent.name,
      icon: (
        <Avatar
          name={agent.name}
          emoji={agent.emoji}
          backgroundColor={agent.backgroundColor}
          size="xs"
        />
      ),
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}
