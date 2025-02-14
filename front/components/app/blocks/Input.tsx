import {
  Button,
  EyeIcon,
  PencilSquareIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  AppType,
  BlockType,
  DatasetType,
  RunType,
  SpecificationBlockType,
  SpecificationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useState } from "react";

import DatasetPicker from "@app/components/app/DatasetPicker";
import DatasetView from "@app/components/app/DatasetView";
import { useDataset } from "@app/lib/swr/datasets";
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
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);
  const { dataset, isDatasetLoading, isDatasetError } = useDataset(
    owner,
    app,
    block.config.dataset,
    true
  );

  const [datasetModalData, setDatasetModalData] = useState<DatasetType | null>(
    null
  );
  const sendNotification = useSendNotification();

  const handleSetDataset = async (dataset: string) => {
    const b = shallowBlockClone(block);
    b.config.dataset = dataset;
    onBlockUpdate(b);
  };

  const onDatasetDataModalSave = async () => {
    setIsDatasetModalOpen(false);
    setDatasetModalData(null);
    if (dataset) {
      const res = await fetch(
        `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/${block.config.dataset}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dataset: datasetModalData,
            schema: dataset.schema,
          }),
        }
      );
      if (res.ok) {
        sendNotification({
          title: `Dataset updated`,
          description: `The data of ${block.config.dataset} was successfully updated.`,
          type: "success",
        });
      }
    }
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
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setIsDatasetModalOpen(true)}
                      icon={readOnly ? EyeIcon : PencilSquareIcon}
                      label={readOnly ? "View" : "Edit"}
                      size="xs"
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <Sheet
            open={isDatasetModalOpen}
            onOpenChange={(open) => setIsDatasetModalOpen(open)}
          >
            <SheetContent size="lg">
              {dataset && dataset.schema ? (
                <>
                  <SheetHeader>
                    <SheetTitle>{block.config.dataset}</SheetTitle>
                  </SheetHeader>
                  <SheetContainer>
                    {!readOnly && (
                      <Button
                        className="mb-4 ml-1"
                        variant="outline"
                        onClick={() => {
                          window.location.href = `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/${block.config.dataset}`;
                        }}
                        icon={PencilSquareIcon}
                        label="Edit schema"
                      />
                    )}
                    <DatasetView
                      readOnly={readOnly}
                      datasets={[dataset]}
                      dataset={dataset}
                      schema={dataset.schema}
                      onUpdate={(
                        initializing: boolean,
                        valid: boolean,
                        currentDatasetInEditor: DatasetType
                      ) => {
                        if (!initializing && valid) {
                          setDatasetModalData(currentDatasetInEditor);
                        }
                      }}
                      nameDisabled={true}
                      viewType="block"
                    />
                  </SheetContainer>
                  <SheetFooter
                    leftButtonProps={{
                      label: "Cancel",
                      variant: "outline",
                    }}
                    rightButtonProps={{
                      label: "Save",
                      onClick: onDatasetDataModalSave,
                      disabled: !datasetModalData,
                    }}
                  />
                </>
              ) : null}
            </SheetContent>
          </Sheet>
        </div>
      ) : null}
    </Block>
  );
}
