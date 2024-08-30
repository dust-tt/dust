import { Modal } from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfigurations,
  WorkspaceType,
} from "@dust-tt/types";
import type { SetStateAction } from "react";
import { useContext, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { DataSourceViewsSelector } from "@app/components/data_source_view/DataSourceViewSelector";

export default function AssistantBuilderDataSourceModal({
  isOpen,
  setOpen,
  owner,
  onSave,
  initialDataSourceConfigurations,
}: {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  owner: WorkspaceType;
  onSave: (dsConfigs: DataSourceViewSelectionConfigurations) => void;
  initialDataSourceConfigurations: DataSourceViewSelectionConfigurations;
}) {
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
          owner={owner}
          dataSourceViews={dataSourceViews}
          selectionConfigurations={selectionConfigurations}
          setSelectionConfigurations={(
            func: SetStateAction<DataSourceViewSelectionConfigurations>
          ) => {
            setHasChanged(true);
            setSelectionConfigurations(func);
          }}
        />
      </div>
    </Modal>
  );
}
