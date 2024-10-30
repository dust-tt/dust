import type { SpaceType, WorkspaceType } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { TimeUnitDropdown } from "@app/components/assistant_builder/actions/TimeDropdown";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderRetrievalConfiguration,
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
    !!action.configuration.timeFrame.value
    ? null
    : "Please select at least one data source and set a timeframe";
}

type ActionRetrievalExhaustiveProps = {
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

export function ActionRetrievalExhaustive({
  owner,
  actionConfiguration,
  allowedSpaces,
  updateAction,
  setEdited,
}: ActionRetrievalExhaustiveProps) {
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);

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
        viewType={"documents"}
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
          actionConfiguration={actionConfiguration}
          updateAction={updateAction}
          onEdit={() => setEdited(true)}
        />
      </div>
    </>
  );
}
