import { Button, DropdownMenu } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import type { TimeframeUnit } from "@dust-tt/types";
import { useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { classNames } from "@app/lib/utils";

const deleteDataSource = (
  name: string,
  builderState: AssistantBuilderState,
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void,
  setEdited: (edited: boolean) => void
) => {
  if (builderState.retrievalConfiguration.dataSourceConfigurations[name]) {
    setEdited(true);
  }

  setBuilderState(({ retrievalConfiguration, ...rest }) => {
    const dataSourceConfigurations = {
      ...retrievalConfiguration.dataSourceConfigurations,
    };
    delete dataSourceConfigurations[name];
    return {
      retrievalConfiguration: {
        ...retrievalConfiguration,
        dataSourceConfigurations,
      },
      ...rest,
    };
  });
};

export function ActionRetrievalSearch({
  owner,
  builderState,
  setBuilderState,
  setEdited,
  dataSources,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
}) {
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);

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
          setBuilderState((state) => ({
            ...state,
            retrievalConfiguration: {
              ...state.retrievalConfiguration,
              dataSourceConfigurations: {
                ...state.retrievalConfiguration.dataSourceConfigurations,
                [dataSource.name]: {
                  dataSource,
                  selectedResources,
                  isSelectAll,
                },
              },
            },
          }));
        }}
        onDelete={(name) => {
          deleteDataSource(name, builderState, setBuilderState, setEdited);
        }}
        dataSourceConfigurations={
          builderState.retrievalConfiguration.dataSourceConfigurations
        }
      />

      <DataSourceSelectionSection
        owner={owner}
        dataSourceConfigurations={
          builderState.retrievalConfiguration.dataSourceConfigurations
        }
        openDataSourceModal={() => {
          setShowDataSourcesModal(true);
        }}
        canAddDataSource={dataSources.length > 0}
        onDelete={(name) => {
          deleteDataSource(name, builderState, setBuilderState, setEdited);
        }}
      />
    </>
  );
}

export function ActionRetrievalExhaustive({
  owner,
  builderState,
  setBuilderState,
  setEdited,
  dataSources,
  timeFrameError,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
  timeFrameError: string | null;
}) {
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);

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
          setBuilderState((state) => ({
            ...state,
            retrievalConfiguration: {
              ...state.retrievalConfiguration,
              dataSourceConfigurations: {
                ...state.retrievalConfiguration.dataSourceConfigurations,
                [dataSource.name]: {
                  dataSource,
                  selectedResources,
                  isSelectAll,
                },
              },
            },
          }));
        }}
        onDelete={(name) => {
          deleteDataSource(name, builderState, setBuilderState, setEdited);
        }}
        dataSourceConfigurations={
          builderState.retrievalConfiguration.dataSourceConfigurations
        }
      />

      <DataSourceSelectionSection
        owner={owner}
        dataSourceConfigurations={
          builderState.retrievalConfiguration.dataSourceConfigurations
        }
        openDataSourceModal={() => {
          setShowDataSourcesModal(true);
        }}
        canAddDataSource={dataSources.length > 0}
        onDelete={(name) => {
          deleteDataSource(name, builderState, setBuilderState, setEdited);
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
          value={builderState.retrievalConfiguration.timeFrame.value || ""}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value) || !e.target.value) {
              setEdited(true);
              setBuilderState((state) => ({
                ...state,
                retrievalConfiguration: {
                  ...state.retrievalConfiguration,
                  timeFrame: {
                    value,
                    unit: builderState.retrievalConfiguration.timeFrame.unit,
                  },
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
                TIME_FRAME_UNIT_TO_LABEL[
                  builderState.retrievalConfiguration.timeFrame.unit
                ]
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
                  setBuilderState((state) => ({
                    ...state,
                    retrievalConfiguration: {
                      ...state.retrievalConfiguration,
                      timeFrame: {
                        value:
                          builderState.retrievalConfiguration.timeFrame.value,
                        unit: key as TimeframeUnit,
                      },
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
