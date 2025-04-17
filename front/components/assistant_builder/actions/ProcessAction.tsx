import {
  Button,
  Checkbox,
  classNames,
  Hoverable,
  IconButton,
  Input,
  TextArea,
  useSendNotification,
} from "@dust-tt/sparkle";
import { ChevronDownIcon, ChevronUpIcon, SparklesIcon } from "lucide-react";
import React, { useEffect, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/actions/configuration/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/actions/configuration/DataSourceSelectionSection";
import { TimeUnitDropdown } from "@app/components/assistant_builder/actions/TimeDropdown";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderProcessConfiguration,
  AssistantBuilderTimeFrame,
} from "@app/components/assistant_builder/types";
import { isValidJsonSchema } from "@app/lib/utils/json_schemas";
import type { Result, SpaceType, WorkspaceType } from "@app/types";
import { Err, Ok } from "@app/types";

export function hasErrorActionProcess(
  action: AssistantBuilderActionConfiguration
): string | null {
  const errorMessage =
    "You must select at least one data source and generate a valid schema";
  if (action.type !== "PROCESS") {
    return "Invalid action type.";
  }
  if (
    !action.configuration.schema ||
    !isValidJsonSchema(action.configuration.schema).isValid
  ) {
    return errorMessage;
  }
  if (Object.keys(action.configuration.dataSourceConfigurations).length === 0) {
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

type ActionProcessProps = {
  owner: WorkspaceType;
  instructions: string | null;
  actionConfiguration: AssistantBuilderProcessConfiguration | null;
  allowedSpaces: SpaceType[];
  updateAction: (
    setNewActionConfig: (
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
  const [defaultTimeFrame, setDefaultTimeFrame] =
    useState<AssistantBuilderTimeFrame>({
      value: 1,
      unit: "day",
    });
  const [isGeneratingSchema, setIsGeneratingSchema] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [schemaEdit, setSchemaEdit] = useState(
    actionConfiguration?.schema ?? null
  );
  const sendNotification = useSendNotification();
  const toggleAdvancedSettings = () => {
    setShowAdvancedSettings((prev) => !prev);
  };

  useEffect(() => {
    if (actionConfiguration) {
      if (
        actionConfiguration.timeFrame &&
        !actionConfiguration.timeFrame.value
      ) {
        setTimeFrameError("Timeframe must be a number");
      } else {
        // Set the default time frame to the current time frame if it exists,
        // so if the user unchecks the checkbox, it won't reset to initial value
        if (actionConfiguration.timeFrame) {
          setDefaultTimeFrame(actionConfiguration.timeFrame);
        }
        setTimeFrameError(null);
      }
    }
  }, [actionConfiguration]);

  if (!actionConfiguration) {
    return null;
  }
  const timeFrame = actionConfiguration.timeFrame || defaultTimeFrame;
  const timeFrameDisabled = !actionConfiguration.timeFrame;

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
          const schema = res.value ? JSON.stringify(res.value, null, 2) : null;
          setSchemaEdit(schema);
          setEdited(true);
          updateAction((previousAction) => ({
            ...previousAction,
            schema: schema,
          }));
        } else {
          sendNotification({
            title: "Failed to generate schema.",
            type: "error",
            description: `An error occurred while generating the schema: ${res.error.message}`,
          });
        }
      } catch (e) {
        sendNotification({
          title: "Failed to generate schema.",
          type: "error",
          description: `An error occurred while generating the schema. Please contact us if the error persists.`,
        });
      } finally {
        setIsGeneratingSchema(false);
      }
    } else {
      setSchemaEdit(null);
      setEdited(true);
      updateAction((previousAction) => ({
        ...previousAction,
        schema: null,
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
        viewType="document"
      />
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        This tool scans selected data sources within the specified time frame,
        extracting information based on a predefined schema. It can process the
        equivalent to a 1,000-page book (500k tokens). Learn more about this
        feature in the{" "}
        <Hoverable
          variant="highlight"
          onClick={() => {
            window.open("https://docs.dust.tt/docs/extract-data", "_blank");
          }}
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
        viewType="document"
      />

      {onDescriptionChange && (
        <div className="flex flex-col gap-4 pt-8">
          <div className="font-semibold text-muted-foreground dark:text-muted-foreground-night">
            Tool description
          </div>
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Clarify what the tool should do. For example:
            <span className="block text-muted-foreground dark:text-muted-foreground-night">
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

      <div className="flex flex-col gap-4 pt-8">
        <div className="font-semibold text-muted-foreground dark:text-muted-foreground-night">
          Schema
        </div>
        <Button
          tooltip="Automatically re-generate the extraction schema based on Instructions"
          label="Re-generate from Instructions"
          variant="primary"
          icon={SparklesIcon}
          size="sm"
          disabled={isGeneratingSchema || !instructions}
          onClick={generateSchemaFromInstructions}
        />
        <TextArea
          error={isValidJsonSchema(schemaEdit).error}
          showErrorLabel={true}
          placeholder={
            '{\n  "type": "object",\n  "properties": {\n    "name": { "type": "string" },\n    ...\n  }\n}'
          }
          value={schemaEdit ?? ""}
          disabled={isGeneratingSchema}
          onChange={(e) => {
            setSchemaEdit(e.target.value);
            setEdited(true);
            updateAction((previousAction) => ({
              ...previousAction,
              schema: e.target.value ?? null,
            }));
          }}
        />
      </div>

      <div className="flex flex-col gap-4 pt-8">
        <div className="-ml-3 flex flex-row items-center text-lg font-bold text-foreground dark:text-foreground-night">
          <div className="flex items-center">
            <IconButton
              onClick={toggleAdvancedSettings}
              icon={showAdvancedSettings ? ChevronUpIcon : ChevronDownIcon}
              variant="highlight"
            />
            <span>Advanced Settings</span>
          </div>
        </div>
      </div>

      {showAdvancedSettings && (
        <div className={"flex flex-row items-center gap-4 pb-4"}>
          <Checkbox
            checked={!!actionConfiguration.timeFrame}
            onCheckedChange={(checked) => {
              setEdited(true);
              updateAction((previousAction) => ({
                ...previousAction,
                timeFrame: checked ? defaultTimeFrame : undefined,
              }));
            }}
          />
          <div
            className={classNames(
              "text-sm font-semibold",
              timeFrameDisabled ? "text-slate-400" : "text-element-900"
            )}
          >
            Process data from the last
          </div>
          <Input
            type="text"
            messageStatus={timeFrameError ? "error" : "default"}
            value={
              timeFrame.value && !isNaN(timeFrame.value)
                ? timeFrame.value.toString()
                : ""
            }
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value) || !e.target.value) {
                setEdited(true);
                updateAction((previousAction) => ({
                  ...previousAction,
                  timeFrame: {
                    value,
                    unit: timeFrame.unit,
                  },
                }));
              }
            }}
            disabled={timeFrameDisabled}
          />
          <TimeUnitDropdown
            timeFrame={timeFrame}
            updateAction={updateAction}
            onEdit={() => setEdited(true)}
            disabled={timeFrameDisabled}
          />
        </div>
      )}
    </>
  );
}

async function generateSchema({
  owner,
  instructions,
}: {
  owner: WorkspaceType;
  instructions: string;
}): Promise<Result<Record<string, unknown>, Error>> {
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
  return new Ok((await res.json()).schema || null);
}
