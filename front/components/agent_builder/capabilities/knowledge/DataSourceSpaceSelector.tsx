import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import {
  DataSourceList,
  toDataSourceListItem,
} from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { ConfirmContext } from "@app/components/Confirm";
import {
  buildSpaceItems,
  KNOWLEDGE_BROWSER_GROUP_LABELS,
} from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { EnrichedSpaceType } from "@app/types/space";
import { useCallback, useContext, useMemo } from "react";

interface DataSourceSpaceSelectorProps {
  spaces: EnrichedSpaceType[];
}

export function DataSourceSpaceSelector({
  spaces,
}: DataSourceSpaceSelectorProps) {
  const { removeNode, setSpaceEntry } = useDataSourceBuilderContext();

  const confirm = useContext(ConfirmContext);

  const { spaceItems, projectItems } = useMemo(() => {
    const items = buildSpaceItems(spaces);
    const toListItem = (item: (typeof items)[number]) =>
      toDataSourceListItem(item, () => setSpaceEntry(item.space));
    return {
      spaceItems: items
        .filter((item) => item.group === "spaces")
        .map(toListItem),
      projectItems: items
        .filter((item) => item.group === "pods")
        .map(toListItem),
    };
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
      <div className="heading-sm bg-muted-background p-2 text-foreground">
        {KNOWLEDGE_BROWSER_GROUP_LABELS.spaces}:
      </div>
      <DataSourceList
        items={spaceItems}
        showCheckboxOnlyForPartialSelection
        onSelectionChange={handleSpaceSelectionChange}
      />
      {projectItems.length > 0 && (
        <>
          <div className="heading-sm bg-muted-background p-2 text-foreground">
            {KNOWLEDGE_BROWSER_GROUP_LABELS.pods}:
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
