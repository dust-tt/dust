import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";

export function Map({
  user,
  app,
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
}) {
  const handleFromChange = (from) => {
    let b = shallowBlockClone(block);
    b.spec.from = from.toUpperCase();
    onBlockUpdate(b);
  };

  const handleRepeatChange = (repeat) => {
    let b = shallowBlockClone(block);
    b.spec.repeat = repeat;
    onBlockUpdate(b);
  };

  return (
    <Block
      user={user}
      app={app}
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
    >
      <div className="flex flex-col mx-4 w-full">
        <div className="flex flex-col lg:flex-row lg:space-x-4">
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <div className="flex flex-initial">from:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block flex-1 rounded-md px-1 font-bold text-gray-700 uppercase text-sm py-1 w-48",
                  readOnly
                    ? "border-white ring-0 focus:ring-0 focus:border-white"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                readOnly={readOnly}
                value={block.spec.from}
                onChange={(e) => handleFromChange(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <div className="flex flex-initial">repeat:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block flex-1 rounded-md px-1 font-normal text-sm py-1 w-8",
                  readOnly
                    ? "border-white ring-0 focus:ring-0 focus:border-white"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                spellCheck={false}
                readOnly={readOnly}
                value={block.spec.repeat}
                onChange={(e) => handleRepeatChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </Block>
  );
}

export function Reduce({
  user,
  app,
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
}) {
  return (
    <Block
      user={user}
      app={app}
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
    ></Block>
  );
}
