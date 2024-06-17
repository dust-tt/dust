import { Hoverable } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import AssistantBuilderTablesModal from "@app/components/assistant_builder/AssistantBuilderTablesModal";
import TablesSelectionSection from "@app/components/assistant_builder/TablesSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderTablesQueryConfiguration,
} from "@app/components/assistant_builder/types";
import { tableKey } from "@app/lib/client/tables_query";

export function isActionTablesQueryValid(
  action: AssistantBuilderActionConfiguration
) {
  return (
    action.type === "TABLES_QUERY" &&
    Object.keys(action.configuration).length > 0
  );
}

export function ActionTablesQuery({
  owner,
  actionConfiguration,
  updateAction,
  setEdited,
  dataSources,
}: {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderTablesQueryConfiguration | null;
  updateAction: (
    setNewAction: (
      previousAction: AssistantBuilderTablesQueryConfiguration
    ) => AssistantBuilderTablesQueryConfiguration
  ) => void;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
}) {
  const [showTableModal, setShowTableModal] = useState(false);

  if (!actionConfiguration) {
    return null;
  }

  return (
    <>
      <AssistantBuilderTablesModal
        isOpen={showTableModal}
        setOpen={(isOpen) => setShowTableModal(isOpen)}
        owner={owner}
        dataSources={dataSources}
        onSave={(tables, dataSource) => {
          setEdited(true);
          updateAction((previousAction) => {
            const newTables = { ...previousAction };
            if (dataSource.connectorId) {
              Object.keys(newTables)
                .filter((k) => newTables[k].dataSourceId === dataSource.name)
                .forEach((k) => delete newTables[k]);
            }
            for (const t of tables) {
              newTables[tableKey(t)] = t;
            }
            return newTables;
          });
        }}
        tablesQueryConfiguration={actionConfiguration}
      />

      <div className="text-sm text-element-700">
        The assistant will generate a SQL query from your request, execute it on
        the tables selected and use the results to generate an answer. Learn
        more about this feature in the{" "}
        <Hoverable
          onClick={() => {
            window.open(
              "https://dust-tt.notion.site/Table-queries-on-Dust-2f8c6ea53518464b8b7780d55ac7057d",
              "_blank"
            );
          }}
          className="cursor-pointer font-bold text-action-500"
        >
          documentation
        </Hoverable>
        .
      </div>

      <TablesSelectionSection
        show={true}
        tablesQueryConfiguration={actionConfiguration}
        openTableModal={() => {
          setShowTableModal(true);
        }}
        onDelete={(key) => {
          setEdited(true);
          updateAction((previousAction) => {
            const newTables = { ...previousAction };
            delete newTables[key];
            return newTables;
          });
        }}
        canSelectTable={dataSources.length !== 0}
      />
    </>
  );
}
