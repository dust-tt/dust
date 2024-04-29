import { Button, PencilSquareIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";
import type { DatasetSchema, DatasetType } from "@dust-tt/types";
import _ from "lodash";
import { useEffect, useState } from "react";

import DatasetPicker from "@app/components/app/DatasetPicker";
import DatasetView from "@app/components/app/DatasetView";
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
  const [datasetWithData, setDatasetWithData] = useState<DatasetType | null>(
    null
  );

  const handleSetDataset = async (dataset: string) => {
    const b = shallowBlockClone(block);
    b.config.dataset = dataset;
    setDatasetWithData(await handleGetDatasetData(dataset));
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

  useEffect(
    () => {
      if (block.config && block.config.dataset) {
        void handleSetDataset(block.config.dataset);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const onUpdate = _.debounce(
    async (
      initializing: boolean,
      valid: boolean,
      currentDatasetInEditor: DatasetType,
      schema: DatasetSchema
    ) => {
      if (!initializing && valid) {
        await fetch(
          `/api/w/${owner.sId}/apps/${app.sId}/datasets/${block.config.dataset}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              dataset: currentDatasetInEditor,
              schema: schema,
            }),
          }
        );
      }
    },
    800
  );

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
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.href = `/w/${owner.sId}/a/${app.sId}/datasets/${block.config.dataset}`;
                }}
                icon={PencilSquareIcon}
                label="Edit"
                size="xs"
              />
            </div>
          ) : null}
        </div>

        {datasetWithData && datasetWithData.schema ? (
          <div className="max-h-[800px] overflow-y-auto">
            <DatasetView
              readOnly={false}
              datasets={[datasetWithData]}
              dataset={datasetWithData}
              schema={datasetWithData.schema}
              onUpdate={onUpdate}
              nameDisabled={false}
              showDataOnly={true}
            />
          </div>
        ) : null}
      </div>
    </Block>
  );
}
