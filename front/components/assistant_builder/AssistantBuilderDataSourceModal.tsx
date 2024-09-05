import { Modal } from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewSelectionConfigurations,
  WorkspaceType,
} from "@dust-tt/types";
import type { SetStateAction } from "react";
import { useCallback, useContext, useMemo, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { DataSourceViewsSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import { supportsStructuredData } from "@app/lib/data_sources";

interface AssistantBuilderDataSourceModalProps {
  initialDataSourceConfigurations: DataSourceViewSelectionConfigurations;
  isOpen: boolean;
  onSave: (dsConfigs: DataSourceViewSelectionConfigurations) => void;
  owner: WorkspaceType;
  setOpen: (isOpen: boolean) => void;
  viewType: ContentNodesViewType;
}

export default function AssistantBuilderDataSourceModal({
  initialDataSourceConfigurations,
  isOpen,
  onSave,
  owner,
  setOpen,
  viewType,
}: AssistantBuilderDataSourceModalProps) {
  const { dataSourceViews } = useContext(AssistantBuilderContext);
  const [hasChanged, setHasChanged] = useState(false);

  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(
      initialDataSourceConfigurations
    );

  useNavigationLock(true, {
    title: "Warning",
    message:
      "All unsaved changes will be lost, are you sure you want to continue?",
    validation: "primaryWarning",
  });

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
        ? dataSourceViews
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
    >
      <div className="w-full pt-12">
        <DataSourceViewsSelector
          dataSourceViews={supportedDataSourceViewsForViewType}
          owner={owner}
          selectionConfigurations={selectionConfigurations}
          setSelectionConfigurations={setSelectionConfigurationsCallback}
          viewType={viewType}
        />
      </div>
    </Modal>
  );
}
