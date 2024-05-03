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
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import { classNames } from "@app/lib/utils";

const deleteDataSource = ({
  name,
  setBuilderState,
  setEdited,
}: {
  name: string;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
}) => {
  setBuilderState((state) => {
    const action = state.actions[0];
    if (!action || action.type !== "PROCESS") {
      return state;
    }

    if (action.configuration.dataSourceConfigurations[name]) {
      setEdited(true);
    }

    delete action.configuration.dataSourceConfigurations[name];

    return {
      ...state,
      actions: [action],
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
  setBuilderState,
  setEdited,
  dataSources,
}: {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderRetrievalConfiguration | null;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
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
        onSave={({ dataSource, selectedResources, isSelectAll }) => {
          setEdited(true);
          setBuilderState((state) => {
            const action = state.actions[0];
            if (!action || action.type !== "RETRIEVAL_SEARCH") {
              return state;
            }
            action.configuration.dataSourceConfigurations[dataSource.name] = {
              dataSource,
              selectedResources,
              isSelectAll,
            };
            return {
              ...state,
              actions: [action],
            };
          });
        }}
        onDelete={(name) => {
          deleteDataSource({ name, setBuilderState, setEdited });
        }}
        dataSourceConfigurations={actionConfiguration.dataSourceConfigurations}
      />

      <DataSourceSelectionSection
        owner={owner}
        dataSourceConfigurations={actionConfiguration.dataSourceConfigurations}
        openDataSourceModal={() => {
          setShowDataSourcesModal(true);
        }}
        canAddDataSource={dataSources.length > 0}
        onDelete={(name) => {
          deleteDataSource({ name, setBuilderState, setEdited });
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
  setBuilderState,
  setEdited,
  dataSources,
}: {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderRetrievalConfiguration | null;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
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
        onSave={({ dataSource, selectedResources, isSelectAll }) => {
          setEdited(true);
          setBuilderState((state) => {
            const action = state.actions[0];
            if (!action || action.type !== "RETRIEVAL_EXHAUSTIVE") {
              return state;
            }
            action.configuration.dataSourceConfigurations[dataSource.name] = {
              dataSource,
              selectedResources,
              isSelectAll,
            };
            return {
              ...state,
              actions: [action],
            };
          });
        }}
        onDelete={(name) => {
          deleteDataSource({ name, setBuilderState, setEdited });
        }}
        dataSourceConfigurations={actionConfiguration.dataSourceConfigurations}
      />

      <DataSourceSelectionSection
        owner={owner}
        dataSourceConfigurations={actionConfiguration.dataSourceConfigurations}
        openDataSourceModal={() => {
          setShowDataSourcesModal(true);
        }}
        canAddDataSource={dataSources.length > 0}
        onDelete={(name) => {
          deleteDataSource({ name, setBuilderState, setEdited });
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
              setBuilderState((state) => {
                const action = state.actions[0];
                if (!action || action.type !== "RETRIEVAL_EXHAUSTIVE") {
                  return state;
                }
                const newState: AssistantBuilderState = {
                  ...state,
                  actions: [
                    {
                      ...action,
                      configuration: {
                        ...action.configuration,
                        timeFrame: {
                          value,
                          unit: action.configuration.timeFrame.unit,
                        },
                      },
                    },
                  ],
                };

                return newState;
              });
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
                  setBuilderState((state) => {
                    const action = state.actions[0];
                    if (!action || action.type !== "RETRIEVAL_EXHAUSTIVE") {
                      return state;
                    }
                    action.configuration.timeFrame.unit = key as TimeframeUnit;
                    return {
                      ...state,
                      actions: [action],
                    };
                  });
                }}
              />
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
    </>
  );
}
