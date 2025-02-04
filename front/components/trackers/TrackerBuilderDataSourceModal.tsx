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
import type {
  ContentNodesViewType,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import type { SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import { DataSourceViewsSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import {
  supportsDocumentsData,
  supportsStructuredData,
} from "@app/lib/data_sources";

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

  const supportedDataSourceViewsForViewType = useMemo(
    () =>
      viewType === "documents"
        ? dataSourceViews.filter((dsv) => supportsDocumentsData(dsv.dataSource))
        : dataSourceViews.filter((dsv) =>
            supportsStructuredData(dsv.dataSource)
          ),
    [dataSourceViews, viewType]
  );

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
            <DataSourceViewsSelector
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
