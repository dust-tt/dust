import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";
import TextareaAutosize from "react-textarea-autosize";
import SearchPicker from "../SearchPicker";

export default function Search({
  user,
  app,
  block,
  status,
  running,
  readOnly,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
}) {

  const handleQueryChange = (query) => {
    let b = shallowBlockClone(block);
    b.spec.query = query;
    onBlockUpdate(b);
  };

  const handleSearchChange = (search) => {
    let b = shallowBlockClone(block);
    b.config = search;
    onBlockUpdate(b);
  };

  return (
    <Block
      user={user}
      app={app}
      block={block}
      status={status}
      running={running}
      readOnly={readOnly}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
    >
      <div className="flex flex-col mx-4 w-full">
        <div className="flex flex-col lg:flex-row lg:space-x-4">
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <div className="flex flex-initial mr-1">engine:</div>
            <SearchPicker
              user={user}
              readOnly={readOnly}
              model={
                block.config ? block.config : { provider_id: "" }
              }
              onModelUpdate={(search) => {
                handleSearchChange(search);
              }}
            />
          </div>
        </div>
        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex flex-initial items-center">query :</div>
          <div className="flex w-full font-normal">
            <TextareaAutosize
              placeholder=""
              className={classNames(
                "block w-full resize-none rounded-md px-1 font-normal text-sm py-1 font-mono bg-slate-100",
                readOnly
                  ? "border-white ring-0 focus:ring-0 focus:border-white"
                  : "border-white focus:border-gray-300 focus:ring-0"
              )}
              readOnly={readOnly}
              value={block.spec.query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Block>
  );
}
