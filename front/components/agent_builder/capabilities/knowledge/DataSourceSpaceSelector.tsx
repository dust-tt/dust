import { useCallback, useContext, useMemo } from "react";

import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { DataSourceList } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { ConfirmContext } from "@app/components/Confirm";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { getSpaceIcon } from "@app/lib/spaces";
import type { SpaceType } from "@app/types/space";
import { SPACE_KINDS } from "@app/types/space";

export interface DataSourceSpaceSelectorProps {
  spaces: SpaceType[];
}

export function DataSourceSpaceSelector({
  spaces,
}: DataSourceSpaceSelectorProps) {
  const { removeNode, setSpaceEntry } = useDataSourceBuilderContext();

  const confirm = useContext(ConfirmContext);

  const { spaceItems, projectItems } = useMemo(() => {
    const sortedSpaces = spaces.toSorted((a, b) => {
      // First, sort by kind according to the specified order
      const aKindIndex = SPACE_KINDS.indexOf(a.kind);
      const bKindIndex = SPACE_KINDS.indexOf(b.kind);

      // If kinds are different, sort by kind order
      if (aKindIndex !== bKindIndex) {
        return aKindIndex - bKindIndex;
      }

      // If kinds are the same, sort by isRestricted (non-restricted first)
      if (a.isRestricted !== b.isRestricted) {
        return a.isRestricted ? 1 : -1;
      }

      // If kinds and isRestricted are the same, sort by name alphabetically
      return a.name.localeCompare(b.name);
    });

    const spaceItems = sortedSpaces
      .filter((space) => space.kind !== "project")
      .map((space) => ({
        id: space.sId,
        title: space.name,
        icon: getSpaceIcon(space),
        onClick: () => setSpaceEntry(space),
        entry: {
          type: "space" as const,
          space: space,
        },
      }));
    const projectItems = sortedSpaces
      .filter((space) => space.kind === "project")
      .map((space) => ({
        id: space.sId,
        title: space.name,
        icon: getSpaceIcon(space),
        onClick: () => setSpaceEntry(space),
        entry: {
          type: "space" as const,
          space: space,
        },
      }));
    return { spaceItems, projectItems };
  }, [spaces, setSpaceEntry]);

  const handleSpaceSelectionChange = useCallback(
    async (item: DataSourceListItem, selectionState: boolean | "partial") => {
      // Spaces only show checkboxes for partial selections to unselect all
      if (selectionState === "partial") {
        const confirmed = await confirm({
          title: "Are you sure?",
          message: `Do you want to unselect all of "${item.title}"?`,
          validateLabel: "Unselect all",
          validateVariant: "warning",
        });
        if (confirmed) {
          removeNode(item.entry);
        }
      }
    },
    [confirm, removeNode]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="heading-sm bg-muted-background p-2 dark:bg-muted-background-night/50 text-foreground dark:text-foreground-night">
        From spaces:
      </div>
      <DataSourceList
        items={spaceItems}
        showCheckboxOnlyForPartialSelection
        onSelectionChange={handleSpaceSelectionChange}
      />
      {projectItems.length > 0 && (
        <>
          <div className="heading-sm bg-muted-background p-2 dark:bg-muted-background-night/50 text-foreground dark:text-foreground-night">
            From projects:
          </div>
          <DataSourceList
            items={projectItems}
            showCheckboxOnlyForPartialSelection
            onSelectionChange={handleSpaceSelectionChange}
          />
        </>
      )}
    </div>
  );
}
