import { useCallback, useContext, useMemo } from "react";

import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { DataSourceList } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { ConfirmContext } from "@app/components/Confirm";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { getSpaceIcon } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";
import { SPACE_KINDS } from "@app/types";

export interface DataSourceSpaceSelectorProps {
  spaces: SpaceType[];
}

export function DataSourceSpaceSelector({
  spaces,
}: DataSourceSpaceSelectorProps) {
  const { removeNode, setSpaceEntry } = useDataSourceBuilderContext();

  const confirm = useContext(ConfirmContext);

  const spaceItems: DataSourceListItem[] = useMemo(() => {
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

    return sortedSpaces.map((space) => ({
      id: space.sId,
      title: space.name,
      icon: getSpaceIcon(space),
      onClick: () => setSpaceEntry(space),
      entry: {
        type: "space",
        space: space,
      },
    }));
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
    <DataSourceList
      items={spaceItems}
      showCheckboxOnlyForPartialSelection
      onSelectionChange={handleSpaceSelectionChange}
    />
  );
}
