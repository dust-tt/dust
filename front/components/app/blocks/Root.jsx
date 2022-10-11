import Block from "./Block";
import { shallowBlockClone } from "../../../lib/utils";
import DatasetPicker from "../DatasetPicker";

export default function Root({
  app,
  block,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
}) {
  const handleSetDataset = (dataset) => {
    let b = shallowBlockClone(block);
    b.config.dataset = dataset;
    onBlockUpdate(b);
  };

  return (
    <Block
      block={block}
      readOnly={readOnly}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
    >
      <div className="flex flex-col sm:flex-row sm:space-x-2 mx-4">
        <div className="flex flex-row items-center space-x-2 text-sm font-medium text-gray-700 leading-8">
          <div className="flex flex-initial">dataset:</div>
          <DatasetPicker
            app={app}
            dataset={block.config ? block.config.dataset : ""}
            onDatasetUpdate={handleSetDataset}
            readOnly={readOnly}
          />
        </div>
      </div>
    </Block>
  );
}
