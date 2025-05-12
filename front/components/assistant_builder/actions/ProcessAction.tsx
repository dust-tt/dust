import {
  Checkbox,
  classNames,
  Hoverable,
  IconButton,
  Input,
  TextArea,
} from "@dust-tt/sparkle";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import React, { useEffect, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/actions/configuration/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/actions/configuration/DataSourceSelectionSection";
import { JsonSchemaConfigurationSection } from "@app/components/assistant_builder/actions/configuration/JsonSchemaConfigurationSection";
import { TimeUnitDropdown } from "@app/components/assistant_builder/actions/TimeDropdown";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderProcessConfiguration,
  AssistantBuilderTimeFrame,
} from "@app/components/assistant_builder/types";
import { isValidJsonSchema } from "@app/lib/utils/json_schemas";
import type { Result } from "@app/types";
import type { SpaceType, WorkspaceType } from "@app/types";
import { Err, Ok } from "@app/types";

export function hasErrorActionProcess(
  action: AssistantBuilderActionConfiguration
): string | null {
  const errorMessage =
    "You must select at least one data source and generate a valid schema";
  if (action.type !== "PROCESS") {
    return "Invalid action type.";
  }
  if (!isValidJsonSchema(action.configuration._jsonSchemaString).isValid) {
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
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [schemaEdit, setSchemaEdit] = useState(
    actionConfiguration?._jsonSchemaString ??
      (actionConfiguration?.jsonSchema
        ? JSON.stringify(actionConfiguration.jsonSchema, null, 2)
        : null)
  );
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
            Clarify what the tool should do and what data it should extract. For
            example:
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
        <>
          <div className="font-semibold text-muted-foreground dark:text-muted-foreground-night">
            Time Range
          </div>
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            By default, the time frame is determined automatically based on the
            conversation context. Enable manual time frame selection when you
            need to specify an exact range for data extraction.
          </div>
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
        </>
      )}
      <JsonSchemaConfigurationSection
        instructions={instructions ?? ""}
        schemaEdit={schemaEdit ?? ""}
        setSchemaEdit={setSchemaEdit}
        setEdited={setEdited}
        updateAction={updateAction}
        description={description ?? ""}
        schemaConfigurationDescription="Optionally, provide a schema for the data to be extracted. If you do not specify a schema, the tool will determine the schema based on the conversation context."
        generateSchema={(instructions: string) =>
          generateSchema({ owner, instructions })
        }
      />
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
