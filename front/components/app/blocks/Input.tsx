import { Button, PencilSquareIcon, Spinner2 } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";
import type { DatasetSchema, DatasetType } from "@dust-tt/types";
import _ from "lodash";
import { useState } from "react";

import DatasetPicker from "@app/components/app/DatasetPicker";
import DatasetView from "@app/components/app/DatasetView";
import { useDataset } from "@app/lib/swr";
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

  const { dataset, isDatasetLoading, isDatasetError, mutateDataset } =
    useDataset(owner, app, block.config.dataset, true);

  const handleSetDataset = async (datasetName: string) => {
    const b = shallowBlockClone(block);
    b.config.dataset = datasetName;
    onBlockUpdate(b);
  };

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
        await mutateDataset();
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
      {!isDatasetLoading && !isDatasetError ? (
        <div className="w-full">
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
                {block.config && block.config.dataset ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      window.location.href = `/w/${owner.sId}/a/${app.sId}/datasets/${block.config.dataset}`;
                    }}
                    icon={PencilSquareIcon}
                    label="Edit schema"
                    size="xs"
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          {dataset && dataset.schema ? (
            <div className="max-h-[800px] overflow-y-auto">
              <DatasetView
                readOnly={false}
                datasets={[dataset]}
                dataset={dataset}
                schema={dataset.schema}
                onUpdate={onUpdate}
                nameDisabled={false}
                viewType="block"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <Spinner2 />
      )}
    </Block>
  );
}
