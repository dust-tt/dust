import { Button, DropdownMenu, Hoverable } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import type { TimeframeUnit } from "@dust-tt/types";
import { useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { classNames } from "@app/lib/utils";

export function ActionProcess({
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

  const deleteDataSource = (name: string) => {
    if (builderState.processConfiguration.dataSourceConfigurations[name]) {
      setEdited(true);
    }

    setBuilderState(({ processConfiguration, ...rest }) => {
      const dataSourceConfigurations = {
        ...processConfiguration.dataSourceConfigurations,
      };
      delete dataSourceConfigurations[name];
      return {
        processConfiguration: {
          ...processConfiguration,
          dataSourceConfigurations,
        },
        ...rest,
      };
    });
  };

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
            processConfiguration: {
              ...state.processConfiguration,
              dataSourceConfigurations: {
                ...state.processConfiguration.dataSourceConfigurations,
                [dataSource.name]: {
                  dataSource,
                  selectedResources,
                  isSelectAll,
                },
              },
            },
          }));
        }}
        onDelete={deleteDataSource}
        dataSourceConfigurations={
          builderState.processConfiguration.dataSourceConfigurations
        }
      />

      <div className="text-sm text-element-700">
        The assistant will process the data sources over the specified time
        frame and attempt to extract structured information based on the schema
        provided. This action can process up to 500k tokens (the equivalent of
        1000 pages book). Learn more about this feature in the{" "}
        <Hoverable
          onClick={() => {
            window.open(
              "https://dust-tt.notion.site/Table-queries-on-Dust-2f8c6ea53518464b8b7780d55ac7057d",
              "_blank"
            );
          }}
          className="cursor-pointer font-bold text-action-500"
        >
          documentation
        </Hoverable>
        .
      </div>

      <DataSourceSelectionSection
        owner={owner}
        dataSourceConfigurations={
          builderState.processConfiguration.dataSourceConfigurations
        }
        openDataSourceModal={() => {
          setShowDataSourcesModal(true);
        }}
        canAddDataSource={dataSources.length > 0}
        onDelete={deleteDataSource}
      />

      <div className={"flex flex-row items-center gap-4 pb-4"}>
        <div className="text-sm font-semibold text-element-900">
          Process data from the last
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
          value={builderState.processConfiguration.timeFrame.value || ""}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value) || !e.target.value) {
              setEdited(true);
              setBuilderState((state) => ({
                ...state,
                processConfiguration: {
                  ...state.processConfiguration,
                  timeFrame: {
                    value,
                    unit: builderState.processConfiguration.timeFrame.unit,
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
                  builderState.processConfiguration.timeFrame.unit
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
                    processConfiguration: {
                      ...state.processConfiguration,
                      timeFrame: {
                        value:
                          builderState.processConfiguration.timeFrame.value,
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
