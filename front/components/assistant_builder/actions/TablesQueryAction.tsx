import { Hoverable } from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import AssistantBuilderTablesModal from "@app/components/assistant_builder/AssistantBuilderTablesModal";
import TablesSelectionSection from "@app/components/assistant_builder/TablesSelectionSection";
import type {
  AssistantBuilderState,
  AssistantBuilderTableConfiguration,
} from "@app/components/assistant_builder/types";
import { tableKey } from "@app/lib/client/tables_query";

export function ActionTablesQuery({
  owner,
  builderState,
  setBuilderState,
  setEdited,
  dataSources,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  dataSources: DataSourceType[];
}) {
  const [showTableModal, setShowTableModal] = useState(false);

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
          setBuilderState((state) => ({
            ...state,
            tablesQueryConfiguration: {
              ...state.tablesQueryConfiguration,
              ...newTables,
            },
          }));
        }}
        tablesQueryConfiguration={builderState.tablesQueryConfiguration}
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
        show={builderState.actionMode === "TABLES_QUERY"}
        tablesQueryConfiguration={builderState.tablesQueryConfiguration}
        openTableModal={() => {
          setShowTableModal(true);
        }}
        onDelete={(key) => {
          setEdited(true);
          setBuilderState((state) => {
            const tablesQueryConfiguration = state.tablesQueryConfiguration;
            delete tablesQueryConfiguration[key];
            return {
              ...state,
              tablesQueryConfiguration,
            };
          });
        }}
        canSelectTable={dataSources.length !== 0}
      />
    </>
  );
}
