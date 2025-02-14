import "@uiw/react-textarea-code-editor/dist.css";

import { Button, Label, PlusIcon, XMarkIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";
import _ from "lodash";
import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";

import DataSourcePicker from "@app/components/data_source/DataSourcePicker";
import TablePicker from "@app/components/tables/TablePicker";
import { classNames, shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export interface TableConfig {
  workspace_id: string;
  data_source_id: string;
  table_id: string;
}

export function TablesManager({
  owner,
  app,
  block,
  readOnly,
  onBlockUpdate,
}: React.PropsWithChildren<{
  owner: WorkspaceType;
  app: AppType;
  block: SpecificationBlockType;
  readOnly: boolean;
  onBlockUpdate: (block: SpecificationBlockType) => void;
}>) {
  const addNewTable = useCallback(() => {
    const b = shallowBlockClone(block);
    if (!b.config.tables) {
      b.config.tables = [];
    }
    b.config.tables.push({});
    onBlockUpdate(b);
  }, [block, onBlockUpdate]);

  const removeTable = (index: number) => {
    const b = shallowBlockClone(block);
    b.config.tables.splice(index, 1);
    onBlockUpdate(b);
  };

  const updateTableConfig = (index: number, updates: Partial<TableConfig>) => {
    const b = shallowBlockClone(block);
    if (!b.config.tables) {
      b.config.tables = [];
    }
    b.config.tables[index] = {
      ...b.config.tables[index],
      ...updates,
    };
    onBlockUpdate(b);
  };

  const getSelectedTables = (): Array<{
    dataSourceId: string;
    tableId: string;
  }> => {
    return (
      block.config.tables?.map((t: TableConfig) => ({
        dataSourceId: t.data_source_id,
        tableId: t.table_id,
      })) || []
    );
  };

  useEffect(() => {
    if (!block.config.tables?.length) {
      addNewTable();
    }
  }, [block.config.tables?.length, addNewTable]);

  return (
    <div className="pb-2">
      <Label>Table</Label>
      {block.config.tables?.map((table: TableConfig, index: number) => (
        <div key={index}>
          <div className="flex flex-col items-center xl:flex-row">
            <div className="flex flex-col xl:flex-row xl:space-x-2">
              <div className="mr-2 flex flex-row">
                <DataSourcePicker
                  owner={owner}
                  readOnly={readOnly}
                  currentDataSources={
                    table?.data_source_id
                      ? [
                          {
                            data_source_id: table.data_source_id,
                            workspace_id: table.workspace_id,
                          },
                        ]
                      : []
                  }
                  space={app.space}
                  onDataSourcesUpdate={(dataSources) => {
                    if (dataSources.length === 0) {
                      return;
                    }
                    const ds = dataSources[0];
                    updateTableConfig(index, {
                      workspace_id: ds.workspace_id,
                      data_source_id: ds.data_source_id,
                      table_id: undefined, // Reset table_id when data source changes
                    });
                  }}
                  linksDisabled
                />
              </div>
            </div>

            {table?.data_source_id && (
              <div className="flex flex-col xl:flex-row xl:space-x-2">
                <div className="flex-rows flex">
                  <TablePicker
                    owner={owner}
                    space={app.space}
                    dataSource={{
                      workspace_id: table.workspace_id,
                      data_source_id: table.data_source_id,
                    }}
                    readOnly={readOnly}
                    currentTableId={table.table_id}
                    onTableUpdate={(selectedTable) => {
                      updateTableConfig(index, {
                        table_id: selectedTable.internalId,
                      });
                    }}
                    excludeTables={getSelectedTables()}
                  />
                </div>
              </div>
            )}
            {!readOnly && block.config.tables?.length > 1 && (
              <div>
                <Button
                  onClick={() => removeTable(index)}
                  className={classNames(
                    "text-slate-400 dark:text-slate-400",
                    "hover:text-muted-foreground dark:hover:text-muted-foreground"
                  )}
                  icon={XMarkIcon}
                  size="xs"
                  variant="secondary"
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <div>
        <Button
          type="button"
          onClick={addNewTable}
          className="mt-2"
          icon={PlusIcon}
          label="Add Table"
          size="xs"
          variant="outline"
          disabled={
            !_.last(block.config.tables as Partial<TableConfig>[])?.table_id
          }
        />
      </div>
    </div>
  );
}

export default function Database({
  owner,
  app,
  spec,
  run,
  block,
  status,
  running,
  readOnly,
  showOutputs,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
  onBlockNew,
}: React.PropsWithChildren<{
  owner: WorkspaceType;
  app: AppType;
  spec: SpecificationType;
  run: RunType | null;
  block: SpecificationBlockType;
  status: any;
  running: boolean;
  readOnly: boolean;
  showOutputs: boolean;
  onBlockUpdate: (block: SpecificationBlockType) => void;
  onBlockDelete: () => void;
  onBlockUp: () => void;
  onBlockDown: () => void;
  onBlockNew: (blockType: BlockType | "map_reduce" | "while_end") => void;
}>) {
  const theme = localStorage.getItem("theme");
  return (
    <Block
      owner={owner}
      app={app}
      spec={spec}
      run={run}
      block={block}
      status={status}
      running={running}
      readOnly={readOnly}
      showOutputs={showOutputs}
      canUseCache={false}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="mx-4 flex w-full flex-col">
        <TablesManager
          owner={owner}
          app={app}
          block={block}
          readOnly={readOnly}
          onBlockUpdate={onBlockUpdate}
        />

        <div>
          <Label>Query</Label>
          <div className="w-full font-normal">
            <CodeEditor
              data-color-mode={theme === "dark" ? "dark" : "light"}
              readOnly={readOnly}
              value={block.spec.query}
              language="jinja2"
              placeholder=""
              onChange={(e) => {
                const b = shallowBlockClone(block);
                b.spec.query = e.target.value;
                onBlockUpdate(b);
              }}
              padding={3}
              minHeight={80}
              className="rounded-lg bg-slate-100 dark:bg-slate-100-night"
              style={{
                color: "rgb(55 65 81)",
                fontSize: 13,
                fontFamily:
                  "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
              }}
            />
          </div>
        </div>
      </div>
    </Block>
  );
}
