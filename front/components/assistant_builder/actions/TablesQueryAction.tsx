import { Hoverable } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import AssistantBuilderTablesModal from "@app/components/assistant_builder/AssistantBuilderTablesModal";
import TablesSelectionSection from "@app/components/assistant_builder/TablesSelectionSection";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderState,
  AssistantBuilderTableConfiguration,
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
  setBuilderState,
  setEdited,
  dataSources,
}: {
  owner: WorkspaceType;
  actionConfiguration: AssistantBuilderTablesQueryConfiguration | null;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
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
        onSave={(tables) => {
          setEdited(true);
          const newTables: Record<string, AssistantBuilderTableConfiguration> =
            {};
          for (const t of tables) {
            newTables[tableKey(t)] = t;
          }
          setBuilderState((state) => {
            const action = state.actions[0];
            if (!action || action.type !== "TABLES_QUERY") {
              return state;
            }
            action.configuration = {
              ...action.configuration,
              ...newTables,
            };
            return {
              ...state,
              actions: [action],
            };
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
          setBuilderState((state) => {
            const action = state.actions[0];
            if (!action || action.type !== "TABLES_QUERY") {
              return state;
            }
            const tablesQueryConfiguration = action.configuration;
            delete tablesQueryConfiguration[key];
            return {
              ...state,
              actions: [
                {
                  ...action,
                  configuration: tablesQueryConfiguration,
                },
              ],
            };
          });
        }}
        canSelectTable={dataSources.length !== 0}
      />
    </>
  );
}
