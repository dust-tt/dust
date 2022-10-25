import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";
import TextareaAutosize from "react-textarea-autosize";
import { useProviders } from "../../../lib/swr";
import { filterServiceProviders } from "../../../lib/providers";
import Link from "next/link";

export default function Replit({
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
  const handleReplChange = (repl) => {
    repl = repl.replace(/\s/g, "-");
    console.log(repl);
    let b = shallowBlockClone(block);
    b.spec.repl = repl;
    onBlockUpdate(b);
  };

  const handleReplitUserChange = (replit_user) => {
    replit_user = replit_user.replace(/\s/g, "");
    let b = shallowBlockClone(block);
    b.spec.replit_user = replit_user;
    onBlockUpdate(b);
  };

  const handlePathChange = (path) => {
    path = path.replace(/\s/g, "");
    let b = shallowBlockClone(block);
    b.spec.path = path;
    onBlockUpdate(b);
  };

  const inputClasses = classNames(
    "block w-full resize-none w-auto rounded-md px-1 font-normal text-sm py-1 font-mono bg-slate-100",
    readOnly
      ? "border-white ring-0 focus:ring-0 focus:border-white"
      : "border-white focus:border-gray-300 focus:ring-0"
  );

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
        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex-initial flex flex-row items-center space-x-1">
            <div className="flex flex-initial items-center">
              Enter the Repl name, Replit user, and path to an API endpoint:
            </div>
          </div>
          <div className="flex w-full font-normal">
            https://
            <input
              placeholder="Repl name"
              value={block.spec.repl}
              className={inputClasses}
              onChange={(e) => handleReplChange(e.target.value)}
            ></input>
            .
            <input
              placeholder="Replit username"
              value={block.spec.replit_user}
              className={inputClasses}
              onChange={(e) => handleReplitUserChange(e.target.value)}
            ></input>
            .repl.co/
            <input
              placeholder="path/to/api/endpoint"
              value={block.spec.path}
              className={inputClasses}
              onChange={(e) => handlePathChange(e.target.value)}
            ></input>
          </div>
          <div className="flex flex-initial items-center">
            Don't know where to get started? Check out and fork our{" "}
            <a
              className="text-violet-600 font-bold"
              href="https://replit.com/@aickin/Dust-with-Nextjs?v=1"
            >
              Next.js-based template on Replit
            </a>
            .
          </div>
        </div>
      </div>
    </Block>
  );
}
