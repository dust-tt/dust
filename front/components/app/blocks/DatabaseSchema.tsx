import "@uiw/react-textarea-code-editor/dist.css";

import DataSourcePicker from "@app/components/data_source/DataSourcePicker";
import DatabasePicker from "@app/components/database/DatabasePicker";
import { shallowBlockClone } from "@app/lib/utils";
import { SpecificationBlockType, SpecificationType } from "@app/types/app";
import { AppType } from "@app/types/app";
import { BlockType } from "@app/types/run";
import { RunType } from "@app/types/run";
import { WorkspaceType } from "@app/types/user";

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
      canUseCache={false}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="mx-4 flex w-full flex-col flex-col gap-2 pt-4 xl:flex-row">
        <div className="flex flex-col xl:flex-row xl:space-x-2">
          <div className="mr-1 flex flex-initial text-sm font-medium leading-8 text-gray-700">
            Database:
          </div>
          <div className="mr-2 flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <DataSourcePicker
              owner={owner}
              readOnly={readOnly}
              currentDataSources={
                block.config.database?.data_source_id
                  ? [
                      {
                        data_source_id: block.config.database.data_source_id,
                        workspace_id: block.config.database.workspace_id,
                      },
                    ]
                  : []
              }
              onDataSourcesUpdate={(dataSources) => {
                if (dataSources.length === 0) {
                  return;
                }
                const ds = dataSources[0];
                const b = shallowBlockClone(block);
                b.config.database = {
                  workspace_id: ds.workspace_id,
                  data_source_id: ds.data_source_id,
                };
                onBlockUpdate(b);
              }}
            />
          </div>
        </div>
        {block.config.database?.data_source_id && (
          <div className="flex flex-col xl:flex-row xl:space-x-2">
            <div className="mr-2 flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
              <DatabasePicker
                owner={owner}
                dataSource={{
                  workspace_id: block.config.database.workspace_id,
                  data_source_id: block.config.database.data_source_id,
                }}
                readOnly={readOnly}
                currentDatabaseId={block.config.database?.database_id}
                onDatabaseUpdate={(database) => {
                  const b = shallowBlockClone(block);
                  b.config.database.database_id = database.database_id;
                  onBlockUpdate(b);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Block>
  );
}
