import { Icon, SearchInput } from "@dust-tt/sparkle";
import { ACTION_ICON_ALIASES } from "@sparkle/icons/actionIconAliases";
import * as V2Icons from "@sparkle/icons/v2-stroke";
import { useMemo, useState } from "react";

import { PlaygroundScreen } from "../components/PlaygroundScreen";

// Review page for the Action*Icon -> v2-stroke migration: every legacy icon
// next to the glyph that now answers to its name.
//
// The legacy glyphs can no longer be reached through `ActionBeerIcon`, since
// that export is already the v2 icon, so they are loaded straight from the
// leftover generated components. `ActionBeerIcon` was generated from `Beer.tsx`,
// hence the name derivation below.

type IconComponent = React.ComponentType<{ className?: string }>;

// @ts-expect-error - import.meta.glob is a Vite feature
const legacyModules = import.meta.glob("../../../src/icons/actions/*.tsx", {
  eager: true,
}) as Record<string, { default: IconComponent }>;

const legacyIcons = Object.fromEntries(
  Object.entries(legacyModules).map(([path, module]) => [
    path.split("/").pop()?.replace(".tsx", ""),
    module.default,
  ])
);

const rows = Object.entries(ACTION_ICON_ALIASES).map(([oldName, v2Name]) => ({
  oldName,
  v2Name,
  legacy: legacyIcons[oldName.replace(/^Action/, "").replace(/Icon$/, "")],
  current: V2Icons[v2Name] as IconComponent,
}));

export default function ActionIconMapping() {
  const [query, setQuery] = useState("");

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return rows;
    }
    return rows.filter(
      (row) =>
        row.oldName.toLowerCase().includes(needle) ||
        row.v2Name.toLowerCase().includes(needle)
    );
  }, [query]);

  return (
    <PlaygroundScreen>
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <h1 className="heading-3xl mb-1 text-foreground">
          Action icon mapping
        </h1>
        <p className="mb-6 text-base text-muted-foreground">
          Legacy <code>Action*Icon</code> glyphs next to the v2-stroke icons
          they now resolve to. {visibleRows.length} of {rows.length} shown.
        </p>

        <div className="mb-6 max-w-sm">
          <SearchInput
            name="action-icon-filter"
            placeholder="Filter by name"
            value={query}
            onChange={setQuery}
          />
        </div>

        <div className="flex flex-col">
          {visibleRows.map((row) => (
            <div
              key={row.oldName}
              className="grid grid-cols-[auto_1fr_auto_auto_1fr] items-center gap-4 border-b border-separator py-3"
            >
              <Icon visual={row.legacy} size="md" className="text-foreground" />
              <span className="truncate text-sm text-muted-foreground">
                {row.oldName}
              </span>
              <span className="text-muted-foreground">&rarr;</span>
              <Icon
                visual={row.current}
                size="md"
                className="text-foreground"
              />
              <span className="truncate text-sm text-foreground">
                {row.v2Name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PlaygroundScreen>
  );
}
