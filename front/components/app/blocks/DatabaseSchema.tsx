import "@uiw/react-textarea-code-editor/dist.css";

import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";

import DataSourcePicker from "@app/components/data_source/DataSourcePicker";
import TablePicker from "@app/components/tables/TablePicker";
import { shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

export default function DatabaseSchema({
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
        <div className="flex flex-col gap-2 pt-4 xl:flex-row">
          <div className="flex flex-col xl:flex-row xl:space-x-2">
            <div className="mr-1 flex flex-initial text-sm font-medium leading-8 text-gray-700">
              Table:
            </div>
            <div className="mr-2 flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
              <DataSourcePicker
                owner={owner}
                readOnly={readOnly}
                currentDataSources={
                  block.config.tables?.[0]
                    ? [
                        {
                          data_source_id:
                            block.config.tables?.[0].data_source_id,
                          workspace_id: block.config.tables?.[0].workspace_id,
                        },
                      ]
                    : []
                }
                vault={app.vault}
                onDataSourcesUpdate={(dataSources) => {
                  if (dataSources.length === 0) {
                    return;
                  }
                  const ds = dataSources[0];
                  const b = shallowBlockClone(block);
                  if (!b.config.tables) {
                    b.config.tables = [];
                  }
                  b.config.tables[0] = {
                    workspace_id: ds.workspace_id,
                    data_source_id: ds.data_source_id,
                  };
                  onBlockUpdate(b);
                }}
              />
            </div>
          </div>
          {block.config.tables?.[0] && (
            <div className="flex flex-col xl:flex-row xl:space-x-2">
              <div className="mr-2 flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                <TablePicker
                  owner={owner}
                  dataSource={{
                    workspace_id: block.config.tables?.[0].workspace_id,
                    data_source_id: block.config.tables?.[0].data_source_id,
                  }}
                  readOnly={readOnly}
                  currentTableId={block.config.tables?.[0].table_id}
                  onTableUpdate={(table) => {
                    const b = shallowBlockClone(block);
                    block.config.tables[0].table_id = table.table_id;
                    onBlockUpdate(b);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Block>
  );
}
