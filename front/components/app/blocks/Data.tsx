import { Button, PencilSquareIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";

import DatasetPicker from "@app/components/app/DatasetPicker";
import { shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

export default function Data({
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
  const handleSetDataset = (dataset: string) => {
    const b = shallowBlockClone(block);
    b.spec.dataset = dataset;
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
      showOutputs={showOutputs}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
      canUseCache={false}
    >
      <div className="mx-4 flex flex-col sm:flex-row sm:space-x-2">
        <div className="flex flex-row items-center space-x-2 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial">dataset:</div>
          {block.spec.dataset_id && block.spec.hash ? (
            <div className="flex items-center">
              {block.spec.dataset_id}
              <div className="ml-1 text-gray-400">
                ({block.spec.hash.slice(-7)})
              </div>
            </div>
          ) : (
            <DatasetPicker
              owner={owner}
              app={app}
              dataset={block.spec.dataset}
              onDatasetUpdate={handleSetDataset}
              readOnly={readOnly}
            />
          )}
          {block.spec.dataset && (
            <Button
              variant="secondary"
              onClick={() => {
                window.location.href = `/w/${owner.sId}/a/${app.sId}/datasets/${block.spec.dataset}`;
              }}
              icon={PencilSquareIcon}
              label="Edit"
              size="xs"
            />
          )}
        </div>
        {/*
        <div className="flex flex-row items-center space-x-2 text-sm font-medium text-gray-700 leading-8">
          <div className="flex flex-initial">version:</div>
          <div className="flex flex-1 font-normal">latest</div>
        </div>
        */}
      </div>
    </Block>
  );
}
