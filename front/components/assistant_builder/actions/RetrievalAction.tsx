import { Checkbox, Input } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/actions/configuration/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/actions/configuration/DataSourceSelectionSection";
import { TimeUnitDropdown } from "@app/components/assistant_builder/actions/TimeDropdown";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderRetrievalConfiguration,
  AssistantBuilderRetrievalExhaustiveConfiguration,
  AssistantBuilderTimeFrame,
} from "@app/components/assistant_builder/types";
import { classNames } from "@app/lib/utils";
import type { SpaceType, WorkspaceType } from "@app/types";

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
    setNewActionConfig: (
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
        viewType="document"
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
        viewType="document"
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
    setNewActionConfig: (
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
        viewType="document"
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
        viewType="document"
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
              ? "text-muted-foreground dark:text-muted-foreground-night"
              : "text-foreground dark:text-foreground-night"
          )}
        >
          Only include data from the last
        </div>
        <Input
          type="text"
          messageStatus={timeFrameError ? "error" : "default"}
          value={timeFrame.value?.toString() || ""}
          onChange={(e) => {
            const duration = parseInt(e.target.value, 10);
            if (!isNaN(duration) || !e.target.value) {
              setTimeFrameError(null);
              setEdited(true);
              updateAction((previousAction) => ({
                ...previousAction,
                timeFrame: {
                  value: duration || 1,
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
