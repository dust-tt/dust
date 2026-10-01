import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { FilterChip } from "@dust-tt/sparkle";

export type SlashMenuFilter = "all" | "skills" | "tools";

// Order of the chips in the filter bar.
const SLASH_MENU_FILTERS: { filter: SlashMenuFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "skills", label: "Skills" },
  { filter: "tools", label: "Tools" },
];

/**
 * @cc [owner:ykmsd,label:product] filter-capability-sources
 * Under `skills` only skills MUST be searched, under `tools` only tools, and under `all` both.
 * Static commands (attach, upload, pick model...) MUST only be listed under `all`.
 */
export function getSlashMenuFilterSources(filter: SlashMenuFilter): {
  includeCommands: boolean;
  includeSkills: boolean;
  includeTools: boolean;
} {
  switch (filter) {
    case "all":
      return { includeCommands: true, includeSkills: true, includeTools: true };
    case "skills":
      return {
        includeCommands: false,
        includeSkills: true,
        includeTools: false,
      };
    case "tools":
      return {
        includeCommands: false,
        includeSkills: false,
        includeTools: true,
      };
    default:
      assertNeverAndIgnore(filter);
      return { includeCommands: true, includeSkills: true, includeTools: true };
  }
}

export function getSlashMenuFilterEmptyMessage(
  filter: SlashMenuFilter
): string {
  switch (filter) {
    case "skills":
      return "No skills found";
    case "tools":
      return "No tools found";
    case "all":
      return "No commands found";
    default:
      assertNeverAndIgnore(filter);
      return "No commands found";
  }
}

interface SlashMenuFilterBarProps {
  onSelect: (filter: SlashMenuFilter) => void;
  selectedFilter: SlashMenuFilter;
}

/**
 * @cc [owner:ykmsd,label:react] filter-bar-keeps-editor-focus
 * Clicking a chip MUST NOT move focus out of the editor, so typing keeps editing the query.
 */
export function SlashMenuFilterBar({
  onSelect,
  selectedFilter,
}: SlashMenuFilterBarProps) {
  return (
    // The menu is modal: once a chip takes focus, the editor can never take it back.
    <div
      className="flex flex-row flex-wrap gap-1 px-1 my-1.5"
      onMouseDown={(event) => event.preventDefault()}
    >
      {SLASH_MENU_FILTERS.map(({ filter, label }) => (
        <FilterChip
          key={filter}
          label={label}
          isSelected={filter === selectedFilter}
          variant="secondary"
          onClick={() => onSelect(filter)}
        />
      ))}
    </div>
  );
}
