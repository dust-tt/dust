import {
  Button,
  DropdownMenu,
  Hoverable,
  IconButton,
  Input,
  PlusIcon,
  SparklesIcon,
  Spinner,
  TextArea,
  Tooltip,
  XCircleIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { Result, TimeframeUnit } from "@dust-tt/types";
import type {
  DataSourceType,
  ProcessSchemaPropertyType,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import React, { useContext, useEffect, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderProcessConfiguration,
} from "@app/components/assistant_builder/types";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
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
  onGenerateFromInstructions,
}: {
  properties: ProcessSchemaPropertyType[];
  readOnly?: boolean;
  onSetProperties: (properties: ProcessSchemaPropertyType[]) => void;
  onGenerateFromInstructions: () => void;
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
    <div className="flex flex-col gap-y-4">
      {properties.length === 0 ? (
        <EmptyCallToAction
          icon={SparklesIcon}
          label={"Generate from instructions"}
          onClick={() => {
            onGenerateFromInstructions();
          }}
        />
      ) : (
        <div className="mt-4 grid grid-cols-12 gap-x-2 gap-y-2">
          <React.Fragment>
            <div className="col-span-2">
              <label className="block text-sm uppercase text-element-700">
                Property
              </label>
            </div>
            <div className="col-span-7">
              <label className="block text-sm uppercase text-element-700">
                Description
              </label>
            </div>
            <div className="col-span-2">
              <label className="block text-sm uppercase text-element-700">
                Type
              </label>
            </div>
            <div className="col-span-1"></div>
          </React.Fragment>

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

                <div className="col-span-7">
                  <Input
                    placeholder="Description"
                    size="sm"
                    name={`description-${index}`}
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

                <div className="col-span-2">
                  <DropdownMenu>
                    <DropdownMenu.Button tooltipPosition="above">
                      <Button
                        type="select"
                        labelVisible={true}
                        label={prop["type"]}
                        variant="tertiary"
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

                <div className="col-span-1 flex flex-row items-end pb-2">
                  <IconButton
                    icon={XMarkIcon}
                    tooltip="Remove Property"
                    variant="tertiary"
                    onClick={async () => {
                      handleRemoveProperty(index);
                    }}
                  />
                </div>
              </React.Fragment>
            )
          )}
        </div>
      )}
      <div className="col-span-12">
        <Button
          label={"Add a field"}
          size="sm"
          variant="secondary"
          icon={PlusIcon}
          onClick={handleAddProperty}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}

export function ActionProcess({
  owner,
  instructions,
  actionConfiguration,
  updateAction,
  setEdited,
  dataSources,
  description,
  onDescriptionChange,
  isDescriptionValid,
}: {
  owner: WorkspaceType;
  instructions: string | null;
  actionConfiguration: AssistantBuilderProcessConfiguration | null;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderProcessConfiguration
    ) => AssistantBuilderProcessConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
} & (
  | {
      description: string;
      onDescriptionChange: (description: string) => void;
      isDescriptionValid: boolean;
    }
  | {
      description?: undefined;
      onDescriptionChange?: undefined;
      isDescriptionValid?: undefined;
    }
)) {
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  useEffect(() => {
    if (actionConfiguration) {
      if (!actionConfiguration.timeFrame.value) {
        setTimeFrameError("Timeframe must be a number");
      } else {
        setTimeFrameError(null);
      }
    }
  }, [actionConfiguration]);

  if (!actionConfiguration) {
    return null;
  }

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

  const foldersOnly =
    Object.keys(actionConfiguration.dataSourceConfigurations).every(
      (k) =>
        actionConfiguration.dataSourceConfigurations[k].dataSource
          .connectorProvider === null
    ) && Object.keys(actionConfiguration.dataSourceConfigurations).length > 0;

  const generateSchemaFromInstructions = async () => {
    setEdited(true);
    let fullInstructions = `${instructions}`;
    if (description) {
      fullInstructions += `\n\nTool description:\n${description}`;
    }
    if (instructions !== null) {
      setIsGeneratingSchema(true);
      try {
        const res = await generateSchema({
          owner,
          instructions: fullInstructions,
        });

        if (res.isOk()) {
          updateAction((previousAction) => ({
            ...previousAction,
            schema: res.value,
          }));
        } else {
          sendNotification({
            title: "Failed to generate schema.",
            type: "error",
            description: `An error occured while generating the schema: ${res.error.message}`,
          });
        }
      } catch (e) {
        sendNotification({
          title: "Failed to generate schema.",
          type: "error",
          description: `An error occured while generating the schema. Please contact us if the error persists.`,
        });
      } finally {
        setIsGeneratingSchema(false);
      }
    } else {
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
    }
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

      <div className="text-sm text-element-700">
        This tool scans selected data sources within the specified time frame,
        extracting information based on a predefined schema. It can process the
        equivalent to a 1,000-page book (500k tokens). Learn more about this
        feature in the{" "}
        <Hoverable
          onClick={() => {
            window.open("https://docs.dust.tt/docs/extract-data", "_blank");
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

      {(foldersOnly ||
        (actionConfiguration.tagsFilter?.in || []).length > 0) && (
        <div className="flex flex-col">
          <div className="flex flex-row items-center gap-4 pb-4">
            <div className="text-sm font-semibold text-element-900">
              Folder tags filtering
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
                        const tags = (
                          previousAction.tagsFilter?.in || []
                        ).filter((tag) => tag !== t);

                        return {
                          ...previousAction,
                          tagsFilter:
                            tags.length > 0
                              ? {
                                  in: tags,
                                }
                              : null,
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
      )}

      {onDescriptionChange && (
        <div className="flex flex-col gap-4 pt-8">
          <div className="font-semibold text-element-800">Tool description</div>
          <div className="text-sm text-element-600">
            Clarify what the tool should do and what data it should extract. For
            example:
            <span className="block text-element-600">
              "Extract from the #reading slack channel a list of books,
              including their title, author, and the reason why they were
              recommended".
            </span>
          </div>
          <TextArea
            placeholder={"Extract the list of…"}
            value={description}
            onChange={onDescriptionChange}
            error={!isDescriptionValid ? "Description cannot be empty" : null}
          />
        </div>
      )}

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

      <div className="flex flex-col">
        <div className="flex flex-row items-start">
          <div className="flex-grow pb-2 text-sm font-semibold text-element-900">
            Schema
          </div>
          {actionConfiguration.schema.length > 0 && !isGeneratingSchema && (
            <div>
              <Tooltip
                label={
                  "Automatically re-generate the extraction schema based on Instructions"
                }
              >
                <Button
                  label={"Re-generate from Instructions"}
                  variant="tertiary"
                  icon={SparklesIcon}
                  size="xs"
                  disabled={isGeneratingSchema}
                  onClick={generateSchemaFromInstructions}
                />
              </Tooltip>
            </div>
          )}
        </div>
        {isGeneratingSchema ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : (
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
            onGenerateFromInstructions={generateSchemaFromInstructions}
          />
        )}
      </div>
    </>
  );
}

async function generateSchema({
  owner,
  instructions,
}: {
  owner: WorkspaceType;
  instructions: string;
}): Promise<Result<ProcessSchemaPropertyType[], Error>> {
  const res = await fetch(
    `/api/w/${owner.sId}/assistant/builder/process/generate_schema`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instructions,
      }),
    }
  );
  if (!res.ok) {
    return new Err(new Error("Failed to generate schema"));
  }
  return new Ok((await res.json()).schema || []);
}
