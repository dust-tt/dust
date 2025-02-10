import { Modal } from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataSourceViewsSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import { useMultipleDataSourceViewsContentNodes } from "@app/lib/swr/data_source_views";

// We need to stabilize the initial state of the selection configurations,
// to avoid resetting state when swr revalidates initialSelectedDataSources
function useStabilizedValue<T>(
  initialValue: T,
  isOpen: boolean,
  defaultValue: T
): T {
  const [value, setValue] = useState<T | undefined>();
  useEffect(() => {
    if (isOpen && !value) {
      setValue(initialValue);
    } else if (!isOpen) {
      setValue(undefined);
    }
  }, [isOpen, initialValue, value]);
  return value ?? defaultValue;
}

interface SpaceManagedDataSourcesViewsModalProps {
  initialSelectedDataSources: DataSourceViewType[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    selectionConfigurations: DataSourceViewSelectionConfigurations
  ) => void;
  owner: WorkspaceType;
  systemSpaceDataSourceViews: DataSourceViewType[];
  space: SpaceType;
}

export default function SpaceManagedDataSourcesViewsModal({
  initialSelectedDataSources,
  isOpen,
  onClose,
  onSave,
  owner,
  systemSpaceDataSourceViews,
  space,
}: SpaceManagedDataSourcesViewsModalProps) {
  const defaultSelectedDataSources = useStabilizedValue(
    initialSelectedDataSources,
    isOpen,
    []
  );

  const [systemDataSourceViews, spaceDataSourceViews] = useMemo(() => {
    const [systemDataSourceViews, spaceDataSourceViews]: Record<
      string,
      DataSourceViewType
    >[] = [{}, {}];
    defaultSelectedDataSources.forEach((dsv) => {
      systemDataSourceViews[dsv.dataSource.sId] =
        systemSpaceDataSourceViews.find(
          (sdsv) => sdsv.dataSource.sId === dsv.dataSource.sId
        ) ?? dsv;
      spaceDataSourceViews[dsv.dataSource.sId] = dsv;
    });
    return [systemDataSourceViews, spaceDataSourceViews];
  }, [defaultSelectedDataSources, systemSpaceDataSourceViews]);

  const dataSourceViewsAndInternalIds = useMemo(
    () =>
      defaultSelectedDataSources.map((dsv) => ({
        // We are selecting from the system dataSourceView and fetching the nodes from there,
        // so we need to find the corresponding one in the systemSpaceDataSourceViews
        dataSourceView: systemDataSourceViews[dsv.dataSource.sId],
        internalIds: dsv.parentsIn ?? [],
      })),
    [defaultSelectedDataSources, systemDataSourceViews]
  );

  const initialConfigurations = useMultipleDataSourceViewsContentNodes({
    dataSourceViewsAndInternalIds,
    owner,
    viewType: "all",
  });
  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>({});

  const [hasChanged, setHasChanged] = useState(false);
  useEffect(() => {
    if (
      !initialConfigurations.isNodesLoading &&
      !initialConfigurations.isNodesError
    ) {
      const converted = initialConfigurations.dataSourceViewsAndNodes.reduce(
        (acc, config) => {
          // config.dataSourceView is the system dataSourceView,
          // searching back the original dataSourceView from initialSelectedDataSources
          const dataSourceView =
            spaceDataSourceViews[config.dataSourceView.dataSource.sId];

          const isSelectAll = dataSourceView.parentsIn === null;
          const selectedResources = isSelectAll ? [] : config.nodes;

          acc[config.dataSourceView.sId] = {
            dataSourceView: config.dataSourceView,
            selectedResources,
            isSelectAll,
            tagsFilter: null, // No tags filters needed to list data source views
          };
          return acc;
        },
        {} as DataSourceViewSelectionConfigurations
      );
      setSelectionConfigurations(converted);
    }
  }, [initialConfigurations, spaceDataSourceViews]);

  const setSelectionConfigurationsCallback = useCallback(
    (func: SetStateAction<DataSourceViewSelectionConfigurations>) => {
      setHasChanged(true);
      setSelectionConfigurations(func);
    },
    [setSelectionConfigurations]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSave={() => {
        onSave(selectionConfigurations);
        onClose();
      }}
      hasChanged={hasChanged}
      variant="side-md"
      title={`Add connected data to space "${space.name}"`}
    >
      <div className="w-full pt-12">
        <div className="overflow-x-auto">
          <DataSourceViewsSelector
            useCase="spaceDatasourceManagement"
            dataSourceViews={systemSpaceDataSourceViews}
            owner={owner}
            selectionConfigurations={selectionConfigurations}
            setSelectionConfigurations={setSelectionConfigurationsCallback}
            viewType="all"
            isRootSelectable={true}
          />
        </div>
      </div>
    </Modal>
  );
}
