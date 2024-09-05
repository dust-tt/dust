import { Hoverable } from "@dust-tt/sparkle";
import type { VaultType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderTableConfiguration,
} from "@app/components/assistant_builder/types";

export function hasErrorActionTablesQuery(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "TABLES_QUERY" &&
    Object.keys(action.configuration).length > 0
    ? null
    : "Please select one table.";
}

type ActionTablesQueryProps = {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderTableConfiguration | null;
  allowedVaults: VaultType[];
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderTableConfiguration
    ) => AssistantBuilderTableConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
};

export function ActionTablesQuery({
  owner,
  actionConfiguration,
  allowedVaults,
  updateAction,
  setEdited,
}: ActionTablesQueryProps) {
  const [showTableModal, setShowTableModal] = useState(false);

  if (!actionConfiguration) {
    return null;
  }

  return (
    <>
      <AssistantBuilderDataSourceModal
        isOpen={showTableModal}
        setOpen={(isOpen) => {
          setShowTableModal(isOpen);
        }}
        owner={owner}
        onSave={(newViewSelection) => {
          setEdited(true);

          // Update the action configuration with the new view selection.
          // Table query action only supports one table.
          updateAction(() => {
            return {
              ...newViewSelection,
            };
          });
        }}
        initialDataSourceConfigurations={actionConfiguration}
        allowedVaults={allowedVaults}
        viewType="tables"
      />

      <div className="text-sm text-element-700">
        The assistant will generate a SQL query from your request, execute it on
        the tables selected and use the results to generate an answer. Learn
        more about this feature in the{" "}
        <Hoverable
          onClick={() => {
            window.open("https://docs.dust.tt/docs/table-queries", "_blank");
          }}
          className="cursor-pointer font-bold text-action-500"
        >
          documentation
        </Hoverable>
        .
      </div>

      <DataSourceSelectionSection
        owner={owner}
        dataSourceConfigurations={actionConfiguration}
        openDataSourceModal={() => {
          setShowTableModal(true);
        }}
        viewType="tables"
      />
    </>
  );
}
