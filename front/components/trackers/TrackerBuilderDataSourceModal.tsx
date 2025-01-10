import { Modal } from "@dust-tt/sparkle";
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
  isOpen: boolean;
  onSave: (dsConfigs: DataSourceViewSelectionConfigurations) => void;
  owner: WorkspaceType;
  setOpen: (isOpen: boolean) => void;
  viewType: ContentNodesViewType;
}

export default function TrackerBuilderDataSourceModal({
  initialDataSourceConfigurations,
  allowedSpaces,
  dataSourceViews,
  isOpen,
  onSave,
  owner,
  setOpen,
  viewType,
}: TrackerBuilderDataSourceModal) {
  const [hasChanged, setHasChanged] = useState(false);

  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(
      initialDataSourceConfigurations
    );

  const setSelectionConfigurationsCallback = useCallback(
    (func: SetStateAction<DataSourceViewSelectionConfigurations>) => {
      setHasChanged(true);
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
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setSelectionConfigurations(initialDataSourceConfigurations);
        setOpen(false);
      }}
      onSave={() => {
        onSave(selectionConfigurations);
        setOpen(false);
      }}
      hasChanged={hasChanged}
      variant="side-md"
      title="Manage data sources selection"
      className="flex flex-col overflow-hidden"
    >
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
    </Modal>
  );
}
