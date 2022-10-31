import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";

export function Map({
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
  const handleFromChange = (from) => {
    let b = shallowBlockClone(block);
    b.spec.from = from.toUpperCase();
    onBlockUpdate(b);
  };

  const handleRepeatChange = (repeat) => {
    // filter out any non-digits
    repeat = parseInt(repeat);
    // if it's the blank string, then use the special value 0, which
    // means "blank" for the repeat input.
    if (isNaN(repeat)) repeat = 0;
    let b = shallowBlockClone(block);
    b.spec.repeat = repeat.toString();
    onBlockUpdate(b);
  };

  const handleLoopModeChange = (mode) => {
    let b = shallowBlockClone(block);
    if (mode === "array") {
      b.spec.repeat = "";
    } else {
      b.spec.repeat = "3";
    }
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
            <div className="flex flex-initial">
              <select
                className={classNames(
                  "block text-right flex-1 rounded-md px-1 text-gray-700 text-sm bg-slate-100 py-1 pr-8",
                  readOnly
                    ? "border-white ring-0 focus:ring-0 focus:border-white"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                value={block.spec.repeat === "" ? "array" : "output"}
                onChange={(e) => handleLoopModeChange(e.target.value)}
              >
                <option value="array">
                  Loop over the array output of block:
                </option>
                <option value="output">
                  Loop N times over the full output of block:
                </option>
              </select>
            </div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                placeholder="BLOCK_NAME"
                className={classNames(
                  "block flex-1 rounded-md px-1 font-bold text-gray-700 uppercase text-sm bg-slate-100 py-1 w-48",
                  readOnly
                    ? "border-white ring-0 focus:ring-0 focus:border-white"
                    : block.spec.from?.trim() === ""
                    ? "border-orange-400 focus:border-orange-400 focus:ring-0"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                readOnly={readOnly}
                value={block.spec.from}
                onChange={(e) => handleFromChange(e.target.value)}
              />
            </div>
          </div>

          {block.spec.repeat !== "" ? (
            <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
              <div className="flex flex-initial">Loop</div>
              <div className="flex flex-initial font-normal">
                <input
                  type="text"
                  className={classNames(
                    "block flex-1 rounded-md px-1 font-normal bg-slate-100 text-sm py-1 w-12",
                    readOnly
                      ? "border-white ring-0 focus:ring-0 focus:border-white"
                      : block.spec.repeat === "0"
                      ? "border-orange-400 focus:border-orange-400 focus:ring-0"
                      : "border-white focus:border-gray-300 focus:ring-0"
                  )}
                  spellCheck={false}
                  readOnly={readOnly}
                  value={block.spec.repeat === "0" ? "" : block.spec.repeat}
                  onChange={(e) => handleRepeatChange(e.target.value)}
                />
              </div>
              <div className="flex flex-initial">times</div>
            </div>
          ) : null}
        </div>
      </div>
    </Block>
  );
}

export function Reduce({
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
    ></Block>
  );
}
