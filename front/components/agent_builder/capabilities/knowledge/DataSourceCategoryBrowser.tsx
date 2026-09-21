import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import {
  DataSourceList,
  toDataSourceListItem,
} from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { ConfirmContext } from "@app/components/Confirm";
import { buildCategoryItems } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { emptyArray } from "@app/lib/swr/swr";
import type { SpaceType } from "@app/types/space";
import { Spinner } from "@dust-tt/sparkle";
import { useCallback, useContext, useMemo } from "react";

interface DataSourceCategoryBrowserProps {
  space: SpaceType;
}

export function DataSourceCategoryBrowser({
  space,
}: DataSourceCategoryBrowserProps) {
  const { owner } = useAgentBuilderContext();
  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space.sId,
  });
  const { setCategoryEntry, removeNode } = useDataSourceBuilderContext();

  const confirm = useContext(ConfirmContext);
  const { hasFeature } = useFeatureFlags();

  const categoryItems = useMemo((): DataSourceListItem[] => {
    if (!isSpaceInfoLoading && spaceInfo) {
      return buildCategoryItems(spaceInfo.categories, hasFeature).map((item) =>
        toDataSourceListItem(item, () => setCategoryEntry(item.category))
      );
    }
    return emptyArray<DataSourceListItem>();
  }, [hasFeature, isSpaceInfoLoading, setCategoryEntry, spaceInfo]);

  const handleCategorySelectionChange = useCallback(
    async (item: DataSourceListItem, selectionState: boolean | "partial") => {
      // Categories only show checkboxes for partial selections to unselect all
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

  if (isSpaceInfoLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <DataSourceList
      items={categoryItems}
      showCheckboxOnlyForPartialSelection
      onSelectionChange={handleCategorySelectionChange}
    />
  );
}
