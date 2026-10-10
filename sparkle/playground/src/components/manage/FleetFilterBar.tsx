import {
  Button,
  Chip,
  ClockRewind,
  CpuChip01,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Eye,
  FilterFunnel01,
  Icon,
  ShapesPlus,
  Tag01,
  Users01,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

import { FLEET_TOOLS, getToolLabel } from "../../data/fleetTools";
import type { FleetFilters } from "./fleetFilters";
import {
  countActiveFleetFilters,
  EDITED_WITHIN_OPTIONS,
  NOT_USED_FOR_OPTIONS,
  PUBLICATION_OPTIONS,
} from "./fleetFilters";
import { getToolIcon } from "./toolIcons";
import { subFilter } from "./utils";

export interface FleetPerson {
  sId: string;
  fullName: string;
}

/** A filter option; `icon` lets callers supply e.g. a model maker logo. */
export interface FleetFilterOption {
  value: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

/**
 * Dropdown items render icons at "sm" (20px) by default, sized for a single
 * icon carrying the whole row's meaning (Create, Models, Tags elsewhere).
 * This menu stacks many rows of icon + label, where 20px reads heavy — so
 * every icon here is pre-rendered at "xs" (16px) instead.
 */
function smallIcon(visual: ComponentType<{ className?: string }> | undefined) {
  if (!visual) {
    return undefined;
  }
  return <Icon visual={visual} size="xs" className="text-muted-foreground" />;
}

type FleetFilterListKey =
  | "editors"
  | "tools"
  | "publication"
  | "models"
  | "tags";

interface FleetFilterMenuProps {
  filters: FleetFilters;
  people: FleetPerson[];
  // Agents only; skills express publication through availability, and have
  // neither models nor tags.
  showPublication: boolean;
  models?: FleetFilterOption[];
  tags?: FleetFilterOption[];
  onToggle: (key: FleetFilterListKey, value: string) => void;
  onUpdate: (update: Partial<FleetFilters>) => void;
}

/** Searchable multi-select submenu shared by the option-list dimensions. */
function OptionsSubMenu({
  options,
  selected,
  onToggle,
  placeholder,
  emptyLabel,
}: {
  options: FleetFilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  placeholder: string;
  emptyLabel: string;
}) {
  const [search, setSearch] = useState("");
  const searchLower = search.toLowerCase();
  const selectedIds = new Set(selected);
  const filtered = options.filter((option) =>
    subFilter(searchLower, option.label.toLowerCase())
  );

  return (
    <DropdownMenuSubContent className="w-72">
      <DropdownMenuSearchbar
        name="optionSearch"
        placeholder={placeholder}
        value={search}
        onChange={setSearch}
      />
      <DropdownMenuSeparator />
      {filtered.length === 0 && (
        <div className="flex items-center justify-center py-4 text-sm">
          {emptyLabel}
        </div>
      )}
      {filtered.map((option) => (
        <DropdownMenuCheckboxItem
          key={option.value}
          label={option.label}
          icon={smallIcon(option.icon)}
          truncateText
          checked={selectedIds.has(option.value)}
          onCheckedChange={() => onToggle(option.value)}
          onSelect={(event) => event.preventDefault()}
        />
      ))}
    </DropdownMenuSubContent>
  );
}

function ToolsSubMenu({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const searchLower = search.toLowerCase();
  const selectedIds = new Set(selected);
  const connectors = FLEET_TOOLS.filter(
    (tool) =>
      tool.kind === "connector" &&
      subFilter(searchLower, tool.label.toLowerCase())
  );
  const capabilities = FLEET_TOOLS.filter(
    (tool) =>
      tool.kind === "capability" &&
      subFilter(searchLower, tool.label.toLowerCase())
  );

  return (
    <DropdownMenuSubContent className="w-72">
      <DropdownMenuSearchbar
        name="toolSearch"
        placeholder="Search tools"
        value={search}
        onChange={setSearch}
      />
      <DropdownMenuSeparator />
      {connectors.length === 0 && capabilities.length === 0 && (
        <div className="flex items-center justify-center py-4 text-sm">
          No tools found
        </div>
      )}
      {connectors.length > 0 && <DropdownMenuLabel label="Connectors" />}
      {connectors.map((tool) => (
        <DropdownMenuCheckboxItem
          key={tool.id}
          label={tool.label}
          icon={smallIcon(getToolIcon(tool.id))}
          checked={selectedIds.has(tool.id)}
          onCheckedChange={() => onToggle(tool.id)}
          onSelect={(event) => event.preventDefault()}
        />
      ))}
      {capabilities.length > 0 && <DropdownMenuLabel label="Capabilities" />}
      {capabilities.map((tool) => (
        <DropdownMenuCheckboxItem
          key={tool.id}
          label={tool.label}
          icon={smallIcon(getToolIcon(tool.id))}
          checked={selectedIds.has(tool.id)}
          onCheckedChange={() => onToggle(tool.id)}
          onSelect={(event) => event.preventDefault()}
        />
      ))}
    </DropdownMenuSubContent>
  );
}

function PeopleSubMenu({
  people,
  selected,
  onToggle,
  placeholder,
}: {
  people: FleetPerson[];
  selected: string[];
  onToggle: (value: string) => void;
  placeholder: string;
}) {
  const [search, setSearch] = useState("");
  const searchLower = search.toLowerCase();
  const selectedIds = new Set(selected);
  const filtered = people
    .filter((person) => subFilter(searchLower, person.fullName.toLowerCase()))
    .slice(0, 50);

  return (
    <DropdownMenuSubContent className="w-72">
      <DropdownMenuSearchbar
        name="peopleSearch"
        placeholder={placeholder}
        value={search}
        onChange={setSearch}
      />
      <DropdownMenuSeparator />
      {filtered.length === 0 && (
        <div className="flex items-center justify-center py-4 text-sm">
          No members found
        </div>
      )}
      {filtered.map((person) => (
        <DropdownMenuCheckboxItem
          key={person.sId}
          label={person.fullName}
          truncateText
          checked={selectedIds.has(person.sId)}
          onCheckedChange={() => onToggle(person.sId)}
          onSelect={(event) => event.preventDefault()}
        />
      ))}
    </DropdownMenuSubContent>
  );
}

/**
 * Every filter dimension behind one button, each as a submenu. Keeps the
 * toolbar down to Search / Filters / Create on both screens; availability is
 * the one exception, it keeps its own control next to the tabs.
 */
export function FleetFilterMenu({
  filters,
  people,
  showPublication,
  models,
  tags,
  onToggle,
  onUpdate,
}: FleetFilterMenuProps) {
  const activeCount = countActiveFleetFilters(filters);
  const selectedPublication = new Set(filters.publication);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={FilterFunnel01}
          label="Filters"
          counterValue={activeCount.toString()}
          isCounter={activeCount > 0}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="end">
        <DropdownMenuLabel label="Ownership" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Editors" icon={smallIcon(Users01)} />
          <PeopleSubMenu
            people={people}
            selected={filters.editors}
            onToggle={(value) => onToggle("editors", value)}
            placeholder="Search editors"
          />
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuLabel label="Dependencies" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Tools" icon={smallIcon(ShapesPlus)} />
          <ToolsSubMenu
            selected={filters.tools}
            onToggle={(value) => onToggle("tools", value)}
          />
        </DropdownMenuSub>
        {models && models.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger label="Model" icon={smallIcon(CpuChip01)} />
            <OptionsSubMenu
              options={models}
              selected={filters.models}
              onToggle={(value) => onToggle("models", value)}
              placeholder="Search models"
              emptyLabel="No models found"
            />
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel label="Lifecycle" />
        {showPublication &&
          PUBLICATION_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              label={option.label}
              checked={selectedPublication.has(option.value)}
              onCheckedChange={() => onToggle("publication", option.value)}
              onSelect={(event) => event.preventDefault()}
            />
          ))}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            label="Last edited"
            icon={smallIcon(ClockRewind)}
          />
          <DropdownMenuSubContent className="w-60">
            <DropdownMenuRadioGroup value={filters.editedWithin ?? ""}>
              {EDITED_WITHIN_OPTIONS.map((option) => (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  onClick={() =>
                    onUpdate({
                      editedWithin:
                        filters.editedWithin === option.value
                          ? null
                          : option.value,
                    })
                  }
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Human usage" icon={smallIcon(Eye)} />
          <DropdownMenuSubContent className="w-64">
            <DropdownMenuRadioGroup value={filters.notUsedFor ?? ""}>
              {NOT_USED_FOR_OPTIONS.map((option) => (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  onClick={() =>
                    onUpdate({
                      notUsedFor:
                        filters.notUsedFor === option.value
                          ? null
                          : option.value,
                    })
                  }
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {tags && tags.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger label="Tags" icon={smallIcon(Tag01)} />
              <OptionsSubMenu
                options={tags}
                selected={filters.tags}
                onToggle={(value) => onToggle("tags", value)}
                placeholder="Search tags"
                emptyLabel="No tags found"
              />
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FleetFilterChipsProps {
  filters: FleetFilters;
  peopleById: Map<string, string>;
  onRemove: (update: Partial<FleetFilters>) => void;
  onClear: () => void;
  // Agents only; used to resolve ids to labels and icons.
  models?: FleetFilterOption[];
  tags?: FleetFilterOption[];
}

/**
 * Active filters as removable chips — the row Manage Agents already uses for
 * models and tags, extended to every dimension and reused on Manage Skills.
 */
export function FleetFilterChips({
  filters,
  peopleById,
  onRemove,
  onClear,
  models,
  tags,
}: FleetFilterChipsProps) {
  const modelsByValue = new Map(
    (models ?? []).map((option) => [option.value, option])
  );
  const tagsByValue = new Map(
    (tags ?? []).map((option) => [option.value, option])
  );

  const chips: React.ReactNode[] = [];

  for (const modelId of filters.models) {
    const option = modelsByValue.get(modelId);
    chips.push(
      <Chip
        key={`model-${modelId}`}
        size="xs"
        color="primary"
        icon={option?.icon}
        label={option?.label ?? modelId}
        onRemove={() =>
          onRemove({ models: filters.models.filter((m) => m !== modelId) })
        }
      />
    );
  }

  for (const tagId of filters.tags) {
    chips.push(
      <Chip
        key={`tag-${tagId}`}
        size="xs"
        color="info"
        label={tagsByValue.get(tagId)?.label ?? tagId}
        onRemove={() =>
          onRemove({ tags: filters.tags.filter((t) => t !== tagId) })
        }
      />
    );
  }

  for (const publication of filters.publication) {
    chips.push(
      <Chip
        key={`publication-${publication}`}
        size="xs"
        color="primary"
        label={
          PUBLICATION_OPTIONS.find((o) => o.value === publication)?.label ??
          publication
        }
        onRemove={() =>
          onRemove({
            publication: filters.publication.filter((p) => p !== publication),
          })
        }
      />
    );
  }

  for (const tool of filters.tools) {
    chips.push(
      <Chip
        key={`tool-${tool}`}
        size="xs"
        color="primary"
        icon={getToolIcon(tool)}
        label={getToolLabel(tool)}
        onRemove={() =>
          onRemove({ tools: filters.tools.filter((t) => t !== tool) })
        }
      />
    );
  }

  for (const editorId of filters.editors) {
    chips.push(
      <Chip
        key={`editor-${editorId}`}
        size="xs"
        color="info"
        icon={Users01}
        label={peopleById.get(editorId) ?? editorId}
        onRemove={() =>
          onRemove({ editors: filters.editors.filter((e) => e !== editorId) })
        }
      />
    );
  }

  if (filters.editedWithin) {
    chips.push(
      <Chip
        key="edited-within"
        size="xs"
        color="primary"
        icon={ClockRewind}
        label={
          EDITED_WITHIN_OPTIONS.find((o) => o.value === filters.editedWithin)
            ?.label ?? ""
        }
        onRemove={() => onRemove({ editedWithin: null })}
      />
    );
  }

  if (filters.notUsedFor) {
    chips.push(
      <Chip
        key="not-used-for"
        size="xs"
        color="warning"
        icon={Eye}
        label={
          NOT_USED_FOR_OPTIONS.find((o) => o.value === filters.notUsedFor)
            ?.label ?? ""
        }
        onRemove={() => onRemove({ notUsedFor: null })}
      />
    );
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-row flex-wrap items-center gap-2">
      {chips}
      {chips.length > 1 && (
        <Button variant="ghost" size="xs" label="Clear all" onClick={onClear} />
      )}
    </div>
  );
}
