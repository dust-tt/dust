import Block from "./Block";
import DatasetPicker from "../DatasetPicker";

export default function Data({
  app,
  block,
  status,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
}) {
  const handleSetDataset = (dataset) => {
    let b = Object.assign({}, block);
    b.spec = Object.assign({}, block.spec);
    b.spec.dataset = dataset;
    onBlockUpdate(b);
  };

  return (
    <Block
      app={app}
      block={block}
      status={status}
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
            dataset={block.spec.dataset}
            onDatasetUpdate={handleSetDataset}
            readOnly={readOnly}
          />
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
