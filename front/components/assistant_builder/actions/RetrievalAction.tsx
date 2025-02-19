import { Checkbox } from "@dust-tt/sparkle";
import type { SpaceType, WorkspaceType } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { TimeUnitDropdown } from "@app/components/assistant_builder/actions/TimeDropdown";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderRetrievalConfiguration,
  AssistantBuilderRetrievalExhaustiveConfiguration,
  AssistantBuilderTimeFrame,
} from "@app/components/assistant_builder/types";
import { classNames } from "@app/lib/utils";

export function hasErrorActionRetrievalSearch(
  action: AssistantBuilderActionConfiguration
): string | null {
  return Object.keys(
    action.type === "RETRIEVAL_SEARCH" &&
      action.configuration.dataSourceConfigurations
  ).length > 0
    ? null
    : "Please select at least one data source.";
}

type ActionRetrievalSearchProps = {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderRetrievalConfiguration | null;
  allowedSpaces: SpaceType[];
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderRetrievalConfiguration
    ) => AssistantBuilderRetrievalConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
};

export function ActionRetrievalSearch({
  owner,
  actionConfiguration,
  allowedSpaces,
  updateAction,
  setEdited,
}: ActionRetrievalSearchProps) {
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
        viewType={"documents"}
      />
    </>
  );
}

export function hasErrorActionRetrievalExhaustive(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "RETRIEVAL_EXHAUSTIVE" &&
    Object.keys(action.configuration.dataSourceConfigurations).length > 0 &&
    // The time frame is optional for exhaustive retrieval, but if it is set, it must be valid.
    (!action.configuration.timeFrame || !!action.configuration.timeFrame.value)
    ? null
    : "Please select at least one data source and set a valid timeframe";
}

type ActionRetrievalExhaustiveProps = {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderRetrievalExhaustiveConfiguration | null;
  allowedSpaces: SpaceType[];
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderRetrievalExhaustiveConfiguration
    ) => AssistantBuilderRetrievalConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
};

export function ActionRetrievalExhaustive({
  owner,
  actionConfiguration,
  allowedSpaces,
  updateAction,
  setEdited,
}: ActionRetrievalExhaustiveProps) {
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);

  const [defaultTimeFrame, setDefaultTimeFrame] =
    useState<AssistantBuilderTimeFrame>({
      value: 1,
      unit: "month",
    });

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
        viewType="documents"
      />

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
        viewType={"documents"}
      />
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
            timeFrameDisabled
              ? "text-slate-400 dark:text-slate-400-night"
              : "text-foreground dark:text-foreground-night"
          )}
        >
          Only include data from the last
        </div>
        <input
          type="text"
          className={classNames(
            "dark:border-gray-300-night h-8 w-16 rounded-md border-gray-300 text-center text-sm",
            !timeFrameError
              ? "focus:border-action-500 focus:ring-action-500"
              : "border-red-500 focus:border-red-500 focus:ring-red-500",
            "bg-structure-50 stroke-structure-50 dark:bg-structure-50-night dark:stroke-structure-50-night",
            timeFrameDisabled ? "text-slate-400 dark:text-slate-400-night" : ""
          )}
          value={timeFrame.value || ""}
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
  );
}
