import { classNames } from "../../../lib/utils";
import {
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/20/solid";
import Output from "./Output";

export default function Block({
  user,
  app,
  block,
  status,
  readOnly,
  children,
  onBlockUpdate,
  onBlockDelete,
  onBlockUp,
  onBlockDown,
}) {
  const handleNameChange = (name) => {
    let b = Object.assign({}, block);
    b.name = name;
    onBlockUpdate(b);
  };

  return (
    <div className="">
      <div
        className={classNames(
          block.indent == 1 ? "ml-8" : "ml-0",
          "flex flex-auto flex-col group rounded-sm border-2 border-gray-300 px-4 py-2"
        )}
      >
        <div className="flex flex-row items-center">
          <div className="flex-initial mr-2">
            <div className="">
              <span className="rounded-md px-1 py-0.5 bg-gray-200 font-medium text-sm">
                {block.type}
              </span>
            </div>
          </div>

          <div className="flex flex-auto font-bold text-gray-700">
            <input
              type="text"
              placeholder="BLOCK_NAME"
              className={classNames(
                "block w-full rounded-md py-1 px-1 placeholder-gray-200 uppercase",
                readOnly
                  ? "border-white ring-0 focus:ring-0 focus:border-white"
                  : block.name.length == 0
                  ? "border-orange-400 focus:border-orange-400 focus:ring-0"
                  : "border-white focus:border-gray-300 focus:ring-0"
              )}
              readOnly={readOnly}
              value={block.name}
              onChange={(e) => handleNameChange(e.target.value.toUpperCase())}
            />
          </div>

          <div
            className={classNames(
              readOnly ? "hidden" : "flex flex-initial flex-row space-x-1 ml-2"
            )}
          >
            <div
              className="flex-initial text-gray-400 sm:text-white group-hover:flex group-hover:text-gray-400 hover:text-red-700 cursor-pointer"
              onClick={onBlockUp}
            >
              <ChevronUpIcon className="h-4 w-4 hover:text-gray-700" />
            </div>
            <div
              className="flex-initial text-gray-400 sm:text-white group-hover:flex group-hover:text-gray-400 hover:text-red-700 cursor-pointer"
              onClick={onBlockDown}
            >
              <ChevronDownIcon className="h-4 w-4 hover:text-gray-700" />
            </div>
            <div
              className="flex-initial text-gray-400 sm:text-white group-hover:text-gray-400 cursor-pointer"
              onClick={onBlockDelete}
            >
              <TrashIcon className="ml-3 h-4 w-4 hover:text-red-700" />
            </div>
          </div>
        </div>
        <div className="flex">{children}</div>
      </div>

      <div className={classNames(block.indent == 1 ? "ml-8" : "ml-0", "py-1")}>
        {status &&
        status.status == "running" &&
        !["map", "reduce"].includes(block.type) ? (
          <div className="flex flex-row items-center text-sm text-gray-400">
            {status.status == "running"
              ? `Running... ${status.success_count} successes ${status.error_count} errors`
              : `Done: ${status.success_count} successes ${status.error_count} errors`}
          </div>
        ) : null}
        {status && status.status != "running" ? (
          <Output user={user} block={block} status={status} app={app} />
        ) : null}
      </div>
    </div>
  );
}
