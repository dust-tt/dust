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
  Lock01,
  Tag01,
  UserCircle,
  Users01,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

import { FLEET_TOOLS, getToolLabel } from "../../data/fleetTools";
import type { FleetFilters, StatusFilterValue } from "./fleetFilters";
import {
  countActiveFleetFilters,
  EDITED_WITHIN_OPTIONS,
  NOT_USED_FOR_OPTIONS,
  VISIBILITY_OPTIONS,
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

type FleetFilterListKey =
  | "editors"
  | "lastEditors"
  | "tools"
  | "status"
  | "visibility"
  | "models"
  | "tags";

interface FleetFilterMenuProps {
  filters: FleetFilters;
  statusOptions: { value: StatusFilterValue; label: string }[];
  people: FleetPerson[];
  // Agents are scoped to a workspace / space / person; skills use their own
  // availability control, which stays where it already is.
  showVisibility: boolean;
  // Agents only. Empty on skills, which have neither.
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
          icon={option.icon}
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
          icon={getToolIcon(tool.id)}
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
          icon={getToolIcon(tool.id)}
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
 * All the new filter dimensions behind one button. The toolbar already carries
 * Search / Batch edit / Models / Tags / Create, so each dimension gets a
 * submenu here rather than its own button.
 */
export function FleetFilterMenu({
  filters,
  statusOptions,
  people,
  showVisibility,
  models,
  tags,
  onToggle,
  onUpdate,
}: FleetFilterMenuProps) {
  const activeCount = countActiveFleetFilters(filters);
  const selectedStatus = new Set(filters.status);
  const selectedVisibility = new Set(filters.visibility);

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
        <DropdownMenuLabel label="Status" />
        {statusOptions.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            label={option.label}
            checked={selectedStatus.has(option.value)}
            onCheckedChange={() => onToggle("status", option.value)}
            onSelect={(event) => event.preventDefault()}
          />
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Tools" icon={FilterFunnel01} />
          <ToolsSubMenu
            selected={filters.tools}
            onToggle={(value) => onToggle("tools", value)}
          />
        </DropdownMenuSub>

        {showVisibility && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger label="Scope" icon={Lock01} />
            <DropdownMenuSubContent className="w-52">
              {VISIBILITY_OPTIONS.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  label={option.label}
                  checked={selectedVisibility.has(option.value)}
                  onCheckedChange={() => onToggle("visibility", option.value)}
                  onSelect={(event) => event.preventDefault()}
                />
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {models && models.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger label="Model" icon={CpuChip01} />
            <OptionsSubMenu
              options={models}
              selected={filters.models}
              onToggle={(value) => onToggle("models", value)}
              placeholder="Search models"
              emptyLabel="No models found"
            />
          </DropdownMenuSub>
        )}

        {tags && tags.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger label="Tags" icon={Tag01} />
            <OptionsSubMenu
              options={tags}
              selected={filters.tags}
              onToggle={(value) => onToggle("tags", value)}
              placeholder="Search tags"
              emptyLabel="No tags found"
            />
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Editors" icon={Users01} />
          <PeopleSubMenu
            people={people}
            selected={filters.editors}
            onToggle={(value) => onToggle("editors", value)}
            placeholder="Search editors"
          />
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Last editor" icon={UserCircle} />
          <PeopleSubMenu
            people={people}
            selected={filters.lastEditors}
            onToggle={(value) => onToggle("lastEditors", value)}
            placeholder="Search members"
          />
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger label="Last edited" icon={ClockRewind} />
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
          <DropdownMenuSubTrigger label="Usage" icon={Eye} />
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FleetFilterChipsProps {
  filters: FleetFilters;
  statusOptions: { value: StatusFilterValue; label: string }[];
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
  statusOptions,
  peopleById,
  onRemove,
  onClear,
  models,
  tags,
}: FleetFilterChipsProps) {
  const statusLabels = new Map(
    statusOptions.map((option) => [option.value, option.label])
  );

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

  for (const status of filters.status) {
    chips.push(
      <Chip
        key={`status-${status}`}
        size="xs"
        color="primary"
        label={statusLabels.get(status) ?? status}
        onRemove={() =>
          onRemove({ status: filters.status.filter((s) => s !== status) })
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

  for (const visibility of filters.visibility) {
    chips.push(
      <Chip
        key={`visibility-${visibility}`}
        size="xs"
        color="primary"
        icon={Lock01}
        label={
          VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.label ??
          visibility
        }
        onRemove={() =>
          onRemove({
            visibility: filters.visibility.filter((v) => v !== visibility),
          })
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

  for (const editorId of filters.lastEditors) {
    chips.push(
      <Chip
        key={`last-editor-${editorId}`}
        size="xs"
        color="info"
        icon={UserCircle}
        label={`Last edited by ${peopleById.get(editorId) ?? editorId}`}
        onRemove={() =>
          onRemove({
            lastEditors: filters.lastEditors.filter((e) => e !== editorId),
          })
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
