import "@uiw/react-textarea-code-editor/dist.css";

import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";

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
  const addNewTable = () => {
    const b = shallowBlockClone(block);
    if (!b.config.tables) {
      b.config.tables = [];
    }
    b.config.tables.push({});
    onBlockUpdate(b);
  };

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

  return (
    <div>
      {(!block.config.tables || block.config.tables.length === 0) && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={addNewTable}
            disabled={readOnly}
            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Add Table
          </button>
        </div>
      )}

      {block.config.tables?.map((table: TableConfig, index: number) => (
        <div
          key={index}
          className="relative border-b border-gray-200 pb-4 pt-4 last:border-b-0"
        >
          {!readOnly && (
            <button
              onClick={() => removeTable(index)}
              className="absolute right-0 top-4 text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}

          <div className="flex flex-col gap-2 xl:flex-row">
            <div className="flex flex-col xl:flex-row xl:space-x-2">
              <div className="mr-1 flex flex-initial text-sm font-medium leading-8 text-gray-700">
                Table {index + 1}:
              </div>
              <div className="mr-2 flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
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
                <div className="mr-2 flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
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
                        table_id: selectedTable.dustDocumentId!,
                      });
                    }}
                    excludeTables={getSelectedTables()}
                  />
                </div>
              </div>
            )}
          </div>

          {index === block.config.tables.length - 1 && !readOnly && (
            <button
              type="button"
              onClick={addNewTable}
              className="mt-4 inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
              Add Another Table
            </button>
          )}
        </div>
      ))}
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
      <div className="mx-4 flex w-full flex-col gap-2">
        <TablesManager
          owner={owner}
          app={app}
          block={block}
          readOnly={readOnly}
          onBlockUpdate={onBlockUpdate}
        />
        {block.config.tables?.some((t: Partial<TableConfig>) => t.table_id) && (
          <div>
            <div className="mr-1 flex flex-initial text-sm font-medium leading-8 text-gray-700">
              query:
            </div>
            <div className="flex w-full font-normal">
              <div className="w-full leading-5">
                <div
                  className={classNames("border border-slate-100 bg-slate-100")}
                  style={{
                    minHeight: "48px",
                  }}
                >
                  <CodeEditor
                    data-color-mode="light"
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
                    style={{
                      color: "rgb(55 65 81)",
                      fontSize: 13,
                      fontFamily:
                        "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                      backgroundColor: "rgb(241 245 249)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Block>
  );
}
