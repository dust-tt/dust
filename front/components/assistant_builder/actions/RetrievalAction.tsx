import { Button, DropdownMenu } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import type { TimeframeUnit } from "@dust-tt/types";
import { useEffect, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderRetrievalConfiguration,
} from "@app/components/assistant_builder/types";
import { classNames } from "@app/lib/utils";

const deleteDataSource = ({
  name,
  updateAction,
  setEdited,
}: {
  name: string;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderRetrievalConfiguration
    ) => AssistantBuilderRetrievalConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
}) => {
  updateAction((previousAction) => {
    if (previousAction.dataSourceConfigurations[name]) {
      setEdited(true);
    }
    const newDataSourceConfigurations = {
      ...previousAction.dataSourceConfigurations,
    };
    delete newDataSourceConfigurations[name];
    return {
      ...previousAction,
      dataSourceConfigurations: newDataSourceConfigurations,
    };
  });
};

export function isActionRetrievalSearchValid(
  action: AssistantBuilderActionConfiguration
) {
  return (
    Object.keys(
      action.type === "RETRIEVAL_SEARCH" &&
        action.configuration.dataSourceConfigurations
    ).length > 0
  );
}

export function ActionRetrievalSearch({
  owner,
  actionConfiguration,
  updateAction,
  setEdited,
  dataSources,
}: {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderRetrievalConfiguration | null;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderRetrievalConfiguration
    ) => AssistantBuilderRetrievalConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
}) {
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);

  if (!actionConfiguration) {
    return null;
  }

  return (
    <>
      <AssistantBuilderDataSourceModal
        isOpen={showDataSourcesModal}
        setOpen={(isOpen) => {
          setShowDataSourcesModal(isOpen);
        }}
        owner={owner}
        dataSources={dataSources}
        onSave={(dsConfigs) => {
          setEdited(true);
          updateAction((previousAction) => ({
            ...previousAction,
            dataSourceConfigurations: dsConfigs,
          }));
        }}
        initialDataSourceConfigurations={
          actionConfiguration.dataSourceConfigurations
        }
      />

      <DataSourceSelectionSection
        owner={owner}
        dataSourceConfigurations={actionConfiguration.dataSourceConfigurations}
        openDataSourceModal={() => {
          setShowDataSourcesModal(true);
        }}
        canAddDataSource={dataSources.length > 0}
        onDelete={(name) => {
          deleteDataSource({
            name,
            updateAction,
            setEdited,
          });
        }}
      />
    </>
  );
}

export function isActionRetrievalExhaustiveValid(
  action: AssistantBuilderActionConfiguration
) {
  return (
    action.type === "RETRIEVAL_EXHAUSTIVE" &&
    Object.keys(action.configuration.dataSourceConfigurations).length > 0 &&
    !!action.configuration.timeFrame.value
  );
}

export function ActionRetrievalExhaustive({
  owner,
  actionConfiguration,
  updateAction,
  setEdited,
  dataSources,
}: {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderRetrievalConfiguration | null;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderRetrievalConfiguration
    ) => AssistantBuilderRetrievalConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
}) {
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);

  if (!actionConfiguration) {
    return null;
  }

  useEffect(() => {
    if (!actionConfiguration.timeFrame.value) {
      setTimeFrameError("Timeframe must be a number");
    } else {
      setTimeFrameError(null);
    }
  }, [actionConfiguration.timeFrame.value, actionConfiguration.timeFrame.unit]);

  return (
    <>
      <AssistantBuilderDataSourceModal
        isOpen={showDataSourcesModal}
        setOpen={(isOpen) => {
          setShowDataSourcesModal(isOpen);
        }}
        owner={owner}
        dataSources={dataSources}
        onSave={(dsConfigs) => {
          setEdited(true);
          updateAction((previousAction) => ({
            ...previousAction,
            dataSourceConfigurations: dsConfigs,
          }));
        }}
        initialDataSourceConfigurations={
          actionConfiguration.dataSourceConfigurations
        }
      />

      <DataSourceSelectionSection
        owner={owner}
        dataSourceConfigurations={actionConfiguration.dataSourceConfigurations}
        openDataSourceModal={() => {
          setShowDataSourcesModal(true);
        }}
        canAddDataSource={dataSources.length > 0}
        onDelete={(name) => {
          deleteDataSource({
            name,
            updateAction,
            setEdited,
          });
        }}
      />
      <div className={"flex flex-row items-center gap-4 pb-4"}>
        <div className="text-sm font-semibold text-element-900">
          Collect data from the last
        </div>
        <input
          type="text"
          className={classNames(
            "h-8 w-16 rounded-md border-gray-300 text-center text-sm",
            !timeFrameError
              ? "focus:border-action-500 focus:ring-action-500"
              : "border-red-500 focus:border-red-500 focus:ring-red-500",
            "bg-structure-50 stroke-structure-50"
          )}
          value={actionConfiguration.timeFrame.value || ""}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value) || !e.target.value) {
              setEdited(true);
              updateAction((previousAction) => ({
                ...previousAction,
                timeFrame: {
                  value,
                  unit: previousAction.timeFrame.unit,
                },
              }));
            }
          }}
        />
        <DropdownMenu>
          <DropdownMenu.Button tooltipPosition="above">
            <Button
              type="select"
              labelVisible={true}
              label={
                TIME_FRAME_UNIT_TO_LABEL[actionConfiguration.timeFrame.unit]
              }
              variant="secondary"
              size="sm"
            />
          </DropdownMenu.Button>
          <DropdownMenu.Items origin="bottomLeft">
            {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(([key, value]) => (
              <DropdownMenu.Item
                key={key}
                label={value}
                onClick={() => {
                  setEdited(true);
                  updateAction((previousAction) => ({
                    ...previousAction,
                    timeFrame: {
                      value: previousAction.timeFrame.value,
                      unit: key as TimeframeUnit,
                    },
                  }));
                }}
              />
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
    </>
  );
}
