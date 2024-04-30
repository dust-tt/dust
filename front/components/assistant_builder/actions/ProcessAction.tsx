import {
  Button,
  DropdownMenu,
  Hoverable,
  IconButton,
  Input,
  PlusIcon,
  SparklesIcon,
  Tooltip,
  XCircleIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceType,
  ProcessSchemaPropertyType,
  WorkspaceType,
} from "@dust-tt/types";
import type { TimeframeUnit } from "@dust-tt/types";
import React, { useEffect, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { classNames } from "@app/lib/utils";

export function isActionProcessValid(builderState: AssistantBuilderState) {
  if (builderState.processConfiguration.schema.length === 0) {
    return false;
  }
  for (const prop of builderState.processConfiguration.schema) {
    if (!prop.name) {
      return false;
    }
    if (!prop.description) {
      return false;
    }
    if (
      builderState.processConfiguration.schema.filter(
        (p) => p.name === prop.name
      ).length > 1
    ) {
      return false;
    }
  }
  return (
    Object.keys(builderState.processConfiguration.dataSourceConfigurations)
      .length > 0 && !!builderState.processConfiguration.timeFrame.value
  );
}

function PropertiesFields({
  properties,
  readOnly,
  onSetProperties,
}: {
  properties: ProcessSchemaPropertyType[];
  readOnly?: boolean;
  onSetProperties: (properties: ProcessSchemaPropertyType[]) => void;
}) {
  function handlePropertyChange(
    index: number,
    field: "name" | "description",
    value: string
  ) {
    const newProperties = [...properties];
    newProperties[index][field] = value;
    onSetProperties(newProperties);
  }

  function handleAddProperty() {
    const newProperties = [...properties];
    newProperties.push({
      name: "",
      type: "string",
      description: "",
    });
    onSetProperties(newProperties);
  }

  function handleTypeChange(
    index: number,
    value: "string" | "number" | "boolean"
  ) {
    const newProperties = [...properties];
    newProperties[index].type = value;
    onSetProperties(newProperties);
  }

  function handleRemoveProperty(index: number) {
    const newProperties = [...properties];
    newProperties.splice(index, 1);
    onSetProperties(newProperties);
  }

  return (
    <div className="mb-12 grid grid-cols-12 grid-cols-12 gap-x-4 gap-y-4">
      {properties.map(
        (
          prop: { name: string; type: string; description: string },
          index: number
        ) => (
          <React.Fragment key={index}>
            <div className="col-span-2">
              <Input
                placeholder="Name"
                size="sm"
                name={`name-${index}`}
                label={index === 0 ? "Property" : undefined}
                value={prop["name"]}
                onChange={(v) => {
                  handlePropertyChange(index, "name", v);
                }}
                disabled={readOnly}
                error={
                  prop["name"].length === 0
                    ? "Name is required"
                    : properties.find(
                        (p, i) => p.name === prop.name && i !== index
                      )
                    ? "Name must be unique"
                    : undefined
                }
              />
            </div>

            <div className="col-span-2">
              {index === 0 && (
                <div className="flex justify-between">
                  <label
                    htmlFor={`type-${index}`}
                    className="block pb-1 pt-[1px] text-sm text-element-800"
                  >
                    Type
                  </label>
                </div>
              )}
              <DropdownMenu>
                <DropdownMenu.Button tooltipPosition="above">
                  <Button
                    type="select"
                    labelVisible={true}
                    label={prop["type"]}
                    variant="secondary"
                    size="sm"
                  />
                </DropdownMenu.Button>
                <DropdownMenu.Items origin="bottomLeft">
                  {["string", "number", "boolean"].map((value, i) => (
                    <DropdownMenu.Item
                      key={`${value}-${i}`}
                      label={value}
                      onClick={() => {
                        handleTypeChange(
                          index,
                          value as "string" | "number" | "boolean"
                        );
                      }}
                    />
                  ))}
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>

            <div className="col-span-7">
              <Input
                placeholder="Description"
                size="sm"
                name={`description-${index}`}
                label={index === 0 ? "Description" : undefined}
                value={prop["description"]}
                onChange={(v) => {
                  handlePropertyChange(index, "description", v);
                }}
                disabled={readOnly}
                error={
                  prop["description"].length === 0
                    ? "Description is required"
                    : undefined
                }
              />
            </div>

            <div className="col-span-1 flex items-end pb-2">
              <IconButton
                icon={XCircleIcon}
                tooltip="Remove Property"
                variant="tertiary"
                onClick={async () => {
                  handleRemoveProperty(index);
                }}
                className="ml-1"
              />
            </div>
          </React.Fragment>
        )
      )}
      <div className="col-span-12">
        {properties.length > 0 && (
          <Button
            label={"Add property"}
            size="xs"
            variant="secondary"
            icon={PlusIcon}
            onClick={handleAddProperty}
            disabled={readOnly}
          />
        )}
      </div>
    </div>
  );
}

export function ActionProcess({
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
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);

  useEffect(() => {
    if (!builderState.processConfiguration.timeFrame.value) {
      setTimeFrameError("Timeframe must be a number");
    } else {
      setTimeFrameError(null);
    }
  }, [
    builderState.processConfiguration.dataSourceConfigurations,
    builderState.processConfiguration.timeFrame.value,
  ]);

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
            window.open("https://foo", "_blank");
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

      <div className="flex flex-row items-start">
        <div className="flex-grow text-sm font-semibold text-element-900">
          Extraction schema
        </div>
        <div>
          <Tooltip
            label={"Automatically generate the schema based on Instructions"}
          >
            <Button
              label={"Generate"}
              variant="primary"
              icon={SparklesIcon}
              size="sm"
              onClick={() => {
                const schema = [
                  {
                    name: "data",
                    type: "string" as const,
                    description: "Required data to follow instructions",
                  },
                ];
                setBuilderState((state) => ({
                  ...state,
                  processConfiguration: {
                    ...state.processConfiguration,
                    schema,
                  },
                }));
              }}
            />
          </Tooltip>
        </div>
      </div>
      <PropertiesFields
        properties={builderState.processConfiguration.schema}
        onSetProperties={(schema: ProcessSchemaPropertyType[]) => {
          setBuilderState((state) => ({
            ...state,
            processConfiguration: {
              ...state.processConfiguration,
              schema,
            },
          }));
          setEdited(true);
        }}
        readOnly={false}
      />
    </>
  );
}
