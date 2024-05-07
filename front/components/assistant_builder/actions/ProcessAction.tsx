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
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderProcessConfiguration,
} from "@app/components/assistant_builder/types";
import { classNames } from "@app/lib/utils";

export function isActionProcessValid(
  action: AssistantBuilderActionConfiguration
) {
  if (action.type !== "PROCESS") {
    return false;
  }
  if (action.configuration.schema.length === 0) {
    return false;
  }
  for (const prop of action.configuration.schema) {
    if (!prop.name) {
      return false;
    }
    if (!prop.description) {
      return false;
    }
    if (
      action.configuration.schema.filter((p) => p.name === prop.name).length > 1
    ) {
      return false;
    }
  }
  if (Object.keys(action.configuration.dataSourceConfigurations).length === 0) {
    return false;
  }
  if (!action.configuration.timeFrame.value) {
    return false;
  }
  if (
    action.configuration.tagsFilter &&
    action.configuration.tagsFilter.in.some((tag) => tag === "")
  ) {
    return false;
  }
  if (
    action.configuration.tagsFilter &&
    action.configuration.tagsFilter.in.length !==
      new Set(action.configuration.tagsFilter.in).size
  ) {
    return false;
  }
  return true;
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
  actionConfiguration,
  updateAction,
  setEdited,
  dataSources,
}: {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderProcessConfiguration | null;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderProcessConfiguration
    ) => AssistantBuilderProcessConfiguration
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
  }, [actionConfiguration.timeFrame.value]);

  const deleteDataSource = (name: string) => {
    updateAction((previousAction) => {
      if (previousAction.dataSourceConfigurations[name]) {
        setEdited(true);
      }
      const dataSourceConfigurations = {
        ...previousAction.dataSourceConfigurations,
      };
      delete dataSourceConfigurations[name];
      return {
        ...previousAction,
        dataSourceConfigurations,
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
          updateAction((previousAction) => ({
            ...previousAction,
            dataSourceConfigurations: {
              ...previousAction.dataSourceConfigurations,
              [dataSource.name]: {
                dataSource,
                selectedResources,
                isSelectAll,
              },
            },
          }));
        }}
        onDelete={deleteDataSource}
        dataSourceConfigurations={actionConfiguration.dataSourceConfigurations}
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
        dataSourceConfigurations={actionConfiguration.dataSourceConfigurations}
        openDataSourceModal={() => {
          setShowDataSourcesModal(true);
        }}
        canAddDataSource={dataSources.length > 0}
        onDelete={deleteDataSource}
      />

      <div className="flex flex-col">
        <div className="flex flex-row items-center gap-4 pb-4">
          <div className="text-sm font-semibold text-element-900">
            Tags Filtering
          </div>
          <div>
            <Button
              label={"Add tag filter"}
              variant="tertiary"
              size="xs"
              onClick={() => {
                setEdited(true);
                updateAction((previousAction) => {
                  const tagsFilter = {
                    in: [...(previousAction.tagsFilter?.in || []), ""],
                  };
                  return {
                    ...previousAction,
                    tagsFilter,
                  };
                });
              }}
              disabled={
                !!actionConfiguration.tagsFilter &&
                actionConfiguration.tagsFilter.in.filter((tag) => tag === "")
                  .length > 0
              }
            />
          </div>
        </div>
        {(actionConfiguration.tagsFilter?.in || []).map((t, i) => {
          return (
            <div className="flex flex-row gap-4" key={`tag-${i}`}>
              <div className="flex">
                <Input
                  placeholder="Enter tag"
                  size="sm"
                  name="tags"
                  value={t}
                  onChange={(v) => {
                    setEdited(true);
                    updateAction((previousAction) => {
                      const tags = [...(previousAction.tagsFilter?.in || [])];
                      tags[i] = v;

                      return {
                        ...previousAction,
                        tagsFilter: {
                          in: tags,
                        },
                      };
                    });
                  }}
                  error={
                    t.length === 0
                      ? "Tag is required"
                      : (actionConfiguration.tagsFilter?.in || []).filter(
                          (tag) => tag === t
                        ).length > 1
                      ? "Tag must be unique"
                      : undefined
                  }
                />
              </div>
              <div className="flex items-end pb-2">
                <IconButton
                  icon={XCircleIcon}
                  tooltip="Remove Property"
                  variant="tertiary"
                  onClick={async () => {
                    setEdited(true);
                    updateAction((previousAction) => {
                      const tags = (previousAction.tagsFilter?.in || []).filter(
                        (tag) => tag !== t
                      );

                      return {
                        ...previousAction,
                        tagsFilter: {
                          in: tags,
                        },
                      };
                    });
                  }}
                  className="ml-1"
                />
              </div>
            </div>
          );
        })}
      </div>

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
                setEdited(true);
                updateAction((previousAction) => ({
                  ...previousAction,
                  schema: [
                    {
                      name: "data",
                      type: "string" as const,
                      description: "Required data to follow instructions",
                    },
                  ],
                }));
              }}
            />
          </Tooltip>
        </div>
      </div>
      <PropertiesFields
        properties={actionConfiguration.schema}
        onSetProperties={(schema: ProcessSchemaPropertyType[]) => {
          setEdited(true);
          updateAction((previousAction) => ({
            ...previousAction,
            schema,
          }));
        }}
        readOnly={false}
      />
    </>
  );
}
