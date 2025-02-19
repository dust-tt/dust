import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Hoverable,
  IconButton,
  Input,
  PlusIcon,
  SparklesIcon,
  Spinner,
  TextArea,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  ProcessSchemaPropertyType,
  Result,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import React, { useEffect, useState } from "react";

import { TimeUnitDropdown } from "@app/components/assistant_builder/actions/TimeDropdown";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderProcessConfiguration,
} from "@app/components/assistant_builder/types";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import { classNames } from "@app/lib/utils";

export function hasErrorActionProcess(
  action: AssistantBuilderActionConfiguration
): string | null {
  const errorMessage =
    "You must select at least one data source and generate a schema will all fields set.";
  if (action.type !== "PROCESS") {
    return "Invalid action type.";
  }
  if (action.configuration.schema.length === 0) {
    return errorMessage;
  }
  for (const prop of action.configuration.schema) {
    if (!prop.name) {
      return errorMessage;
    }
    if (!prop.description) {
      return errorMessage;
    }
    if (
      action.configuration.schema.filter((p) => p.name === prop.name).length > 1
    ) {
      return errorMessage;
    }
  }
  if (Object.keys(action.configuration.dataSourceConfigurations).length === 0) {
    return errorMessage;
  }
  if (!action.configuration.timeFrame.value) {
    return errorMessage;
  }
  if (
    action.configuration.tagsFilter &&
    action.configuration.tagsFilter.in.some((tag) => tag === "")
  ) {
    return errorMessage;
  }
  if (
    action.configuration.tagsFilter &&
    action.configuration.tagsFilter.in.length !==
      new Set(action.configuration.tagsFilter.in).size
  ) {
    return errorMessage;
  }
  return null;
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
                    name={`name-${index}`}
                    value={prop["name"]}
                    onChange={(e) => {
                      handlePropertyChange(index, "name", e.target.value);
                    }}
                    disabled={readOnly}
                    message={
                      prop["name"].length === 0
                        ? "Name is required"
                        : properties.find(
                              (p, i) => p.name === prop.name && i !== index
                            )
                          ? "Name must be unique"
                          : undefined
                    }
                    messageStatus="error"
                  />
                </div>

                <div className="col-span-7">
                  <Input
                    placeholder="Description"
                    name={`description-${index}`}
                    value={prop["description"]}
                    onChange={(e) => {
                      handlePropertyChange(
                        index,
                        "description",
                        e.target.value
                      );
                    }}
                    disabled={readOnly}
                    message={
                      prop["description"].length === 0
                        ? "Description is required"
                        : undefined
                    }
                    messageStatus="error"
                  />
                </div>

                <div className="col-span-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        isSelect
                        label={prop["type"]}
                        variant="ghost"
                        size="sm"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {["string", "number", "boolean"].map((value, i) => (
                        <DropdownMenuItem
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="col-span-1 flex flex-row items-end pb-2">
                  <IconButton
                    icon={XMarkIcon}
                    tooltip="Remove Property"
                    variant="outline"
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
          label="Add a field"
          size="sm"
          variant="outline"
          icon={PlusIcon}
          onClick={handleAddProperty}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}

type ActionProcessProps = {
  owner: WorkspaceType;
  instructions: string | null;
  actionConfiguration: AssistantBuilderProcessConfiguration | null;
  allowedSpaces: SpaceType[];
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderProcessConfiguration
    ) => AssistantBuilderProcessConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
};

export function ActionProcess({
  owner,
  instructions,
  actionConfiguration,
  allowedSpaces,
  updateAction,
  setEdited,
  description,
  onDescriptionChange,
}: ActionProcessProps &
  (
    | {
        description: string;
        onDescriptionChange: (description: string) => void;
      }
    | {
        description?: undefined;
        onDescriptionChange?: undefined;
      }
  )) {
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);
  const sendNotification = useSendNotification();

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
        allowedSpaces={allowedSpaces}
        viewType="documents"
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
        onSave={(dsConfigs) => {
          setEdited(true);
          updateAction((previousAction) => ({
            ...previousAction,
            dataSourceConfigurations: dsConfigs,
          }));
        }}
        viewType="documents"
      />

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
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>
      )}
      <div className={"flex flex-row items-center gap-4 pb-4"}>
        <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
          Process data from the last
        </div>
        <input
          type="text"
          className={classNames(
            "h-8 w-16 rounded-md border-gray-300 text-center text-sm",
            !timeFrameError
              ? "focus:border-action-500 focus:ring-action-500"
              : "border-red-500 focus:border-red-500 focus:ring-red-500",
            "bg-structure-50 stroke-structure-50 dark:bg-structure-50-night dark:stroke-structure-50-night"
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
        <TimeUnitDropdown
          timeFrame={actionConfiguration.timeFrame}
          updateAction={updateAction}
          onEdit={() => setEdited(true)}
        />
      </div>
      <div className="flex flex-col">
        <div className="flex flex-row items-start">
          <div className="flex-grow pb-2 text-sm font-semibold text-foreground dark:text-foreground-night">
            Schema
          </div>
          {actionConfiguration.schema.length > 0 && !isGeneratingSchema && (
            <div>
              <Button
                tooltip="Automatically re-generate the extraction schema based on Instructions"
                label="Re-generate from Instructions"
                variant="ghost"
                icon={SparklesIcon}
                size="xs"
                disabled={isGeneratingSchema}
                onClick={generateSchemaFromInstructions}
              />
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
