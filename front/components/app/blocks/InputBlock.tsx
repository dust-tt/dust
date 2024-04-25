import { Button, PencilSquareIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";
import type { DatasetSchema, DatasetType } from "@dust-tt/types";

import DatasetPicker from "@app/components/app/DatasetPicker";
import DatasetView from "@app/components/app/DatasetView";
import { shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

export default function InputBlock({
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
  const handleSetDataset = async (dataset: string) => {
    const b = shallowBlockClone(block);
    b.config.dataset = dataset;
    b.config.datasetWithData = await handleGetDatasetData(dataset);
    onBlockUpdate(b);
  };

  const handleGetDatasetData = async (dataset: string) => {
    const datasetRes = await fetch(
      `/api/w/${owner.sId}/apps/${app.sId}/datasets/${dataset}?data=true`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    const res = await datasetRes.json();
    return res.dataset;
  };

  const onUpdate = (
    initializing: boolean,
    valid: boolean,
    currentDatasetInEditor: DatasetType,
    schema: DatasetSchema
  ) => {
    if(!initializing && valid) {
      console.log("onUpdate", currentDatasetInEditor, schema);
    }
  };

  console.log("DATASET WITH DATA");
  console.log(block.config.datasetWithData);

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
      <div>
        <div>
          {!((!block.config || !block.config.dataset) && readOnly) ? (
            <div className="flex flex-row items-center space-x-2 text-sm font-medium leading-8 text-gray-700">
              Dataset:&nbsp;
              <DatasetPicker
                owner={owner}
                app={app}
                dataset={block.config ? block.config.dataset : ""}
                onDatasetUpdate={handleSetDataset}
                readOnly={readOnly}
              />
            </div>
          ) : null}
        </div>

        {block.config &&
        block.config.dataset &&
        block.config.datasetWithData ? (
          <div>
            <DatasetView
              readOnly={false}
              datasets={[block.config.datasetWithData]}
              dataset={block.config.datasetWithData}
              schema={block.config.datasetWithData.schema}
              onUpdate={onUpdate}
              nameDisabled={false}
              showDataOnly={true}
            />
            <Button
              variant="secondary"
              onClick={() => {
                window.location.href = `/w/${owner.sId}/a/${app.sId}/datasets/${block.config.dataset}`;
              }}
              icon={PencilSquareIcon}
              label="Edit schema"
              size="xs"
            />
          </div>
        ) : null}
      </div>
    </Block>
  );
}
