import {
  Button,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@dust-tt/sparkle";
import type { SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import {
  isRemoteDatabase,
  supportsDocumentsData,
  supportsStructuredData,
} from "@app/lib/data_sources";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  ContentNodesViewType,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  SpaceType,
  WorkspaceType,
} from "@app/types";
import { assertNever } from "@app/types";

interface TrackerBuilderDataSourceModal {
  initialDataSourceConfigurations: DataSourceViewSelectionConfigurations;
  allowedSpaces: SpaceType[];
  dataSourceViews: DataSourceViewType[];
  onSave: (dsConfigs: DataSourceViewSelectionConfigurations) => void;
  owner: WorkspaceType;
  viewType: ContentNodesViewType;
  disabled: boolean;
}

export default function TrackerBuilderDataSourceModal({
  initialDataSourceConfigurations,
  allowedSpaces,
  dataSourceViews,
  onSave,
  owner,
  viewType,
  disabled,
}: TrackerBuilderDataSourceModal) {
  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(
      initialDataSourceConfigurations
    );

  const setSelectionConfigurationsCallback = useCallback(
    (func: SetStateAction<DataSourceViewSelectionConfigurations>) => {
      setSelectionConfigurations(func);
    },
    [setSelectionConfigurations]
  );

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const supportedDataSourceViewsForViewType = useMemo(() => {
    switch (viewType) {
      case "all":
        return dataSourceViews;
      case "table":
        return dataSourceViews.filter((dsv) =>
          supportsStructuredData(dsv.dataSource)
        );
      case "data_warehouse":
        // For data_warehouse view, filter for remote databases.
        return dataSourceViews.filter((dsv) =>
          isRemoteDatabase(dsv.dataSource)
        );
      case "document":
        return dataSourceViews.filter((dsv) =>
          supportsDocumentsData(dsv.dataSource, featureFlags)
        );
      default:
        assertNever(viewType);
    }
  }, [dataSourceViews, viewType, featureFlags]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          label="Select Documents"
          className="w-fit"
          disabled={disabled}
        />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Manage data sources selection</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div
            id="dataSourceViewsSelector"
            className="overflow-y-auto scrollbar-hide"
          >
            <DataSourceViewsSpaceSelector
              useCase="trackerBuilder"
              dataSourceViews={supportedDataSourceViewsForViewType}
              allowedSpaces={allowedSpaces}
              owner={owner}
              selectionConfigurations={selectionConfigurations}
              setSelectionConfigurations={setSelectionConfigurationsCallback}
              viewType={viewType}
              isRootSelectable={true}
            />
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save",
            onClick: () => {
              onSave(selectionConfigurations);
            },
            disabled,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
