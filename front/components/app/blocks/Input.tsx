import { WorkspaceType } from "@dust-tt/types";
import {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import { BlockType, RunType } from "@dust-tt/types";

import DatasetPicker from "@app/components/app/DatasetPicker";
import { shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

export default function Input({
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
  const handleSetDataset = (dataset: string) => {
    const b = shallowBlockClone(block);
    b.config.dataset = dataset;
    onBlockUpdate(b);
  };

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
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
      canUseCache={false}
    >
      <div className="mx-4 flex flex-col sm:flex-row sm:space-x-2">
        <div className="flex flex-row items-center space-x-2 text-sm font-medium leading-8 text-gray-700">
          {!((!block.config || !block.config.dataset) && readOnly) ? (
            <>
              <div className="flex flex-initial">dataset:</div>
              <DatasetPicker
                owner={owner}
                app={app}
                dataset={block.config ? block.config.dataset : ""}
                onDatasetUpdate={handleSetDataset}
                readOnly={readOnly}
              />
            </>
          ) : null}
        </div>
      </div>
    </Block>
  );
}
