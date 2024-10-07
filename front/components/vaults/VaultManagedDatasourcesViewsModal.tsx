import { Modal } from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DataSourceViewsSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import { useMultipleDataSourceViewsContentNodes } from "@app/lib/swr/data_source_views";

interface VaultManagedDataSourcesViewsModalProps {
  initialSelectedDataSources: DataSourceViewType[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    selectionConfigurations: DataSourceViewSelectionConfigurations
  ) => void;
  owner: WorkspaceType;
  systemVaultDataSourceViews: DataSourceViewType[];
  vault: VaultType;
}

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

export default function VaultManagedDataSourcesViewsModal({
  initialSelectedDataSources,
  isOpen,
  onClose,
  onSave,
  owner,
  systemVaultDataSourceViews,
  vault,
}: VaultManagedDataSourcesViewsModalProps) {
  const defaultSelectedDataSources = useStabilizedValue(
    initialSelectedDataSources,
    isOpen,
    []
  );

  const [systemDataSourceViews, vaultDataSourceViews] = useMemo(() => {
    const [systemDataSourceViews, vaultDataSourceViews]: Record<
      string,
      DataSourceViewType
    >[] = [{}, {}];
    defaultSelectedDataSources.forEach((dsv) => {
      systemDataSourceViews[dsv.dataSource.sId] =
        systemVaultDataSourceViews.find(
          (sdsv) => sdsv.dataSource.sId === dsv.dataSource.sId
        ) ?? dsv;
      vaultDataSourceViews[dsv.dataSource.sId] = dsv;
    });
    return [systemDataSourceViews, vaultDataSourceViews];
  }, [defaultSelectedDataSources, systemVaultDataSourceViews]);

  const dataSourceViewsAndInternalIds = useMemo(
    () =>
      defaultSelectedDataSources.map((dsv) => ({
        // We are selecting from the system dataSourceView and fetching the nodes from there,
        // so we need to find the corresponding one in the systemVaultDataSourceViews
        dataSourceView: systemDataSourceViews[dsv.dataSource.sId],
        internalIds: dsv.parentsIn ?? [],
      })),
    [defaultSelectedDataSources, systemDataSourceViews]
  );

  const initialConfigurations = useMultipleDataSourceViewsContentNodes({
    dataSourceViewsAndInternalIds,
    owner,
    viewType: "documents",
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
            vaultDataSourceViews[config.dataSourceView.dataSource.sId];

          const isSelectAll = dataSourceView.parentsIn === null;
          const selectedResources = isSelectAll ? [] : config.nodes;

          acc[config.dataSourceView.sId] = {
            dataSourceView: config.dataSourceView,
            selectedResources,
            isSelectAll,
          };
          return acc;
        },
        {} as DataSourceViewSelectionConfigurations
      );
      setSelectionConfigurations(converted);
    }
  }, [initialConfigurations, vaultDataSourceViews]);

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
      title={`Add connected data to vault "${vault.name}"`}
    >
      <div className="w-full pt-12">
        <div className="overflow-x-auto">
          <DataSourceViewsSelector
            useCase="vaultDatasourceManagement"
            dataSourceViews={systemVaultDataSourceViews}
            owner={owner}
            selectionConfigurations={selectionConfigurations}
            setSelectionConfigurations={setSelectionConfigurationsCallback}
            viewType="documents"
            isRootSelectable={true}
          />
        </div>
      </div>
    </Modal>
  );
}
