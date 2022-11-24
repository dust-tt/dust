import Block from "./Block";
import { Menu } from "@headlessui/react";
import { useEffect } from "react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import dynamic from "next/dynamic";
import "@uiw/react-textarea-code-editor/dist.css";
import { classNames, shallowBlockClone } from "../../../lib/utils";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function Curl({
  user,
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
}) {
  const availableMethods = ["GET", "POST", "PUT", "PATCH"];

  const handleSchemeChange = (scheme) => {
    let b = shallowBlockClone(block);
    b.spec.scheme = scheme;
    onBlockUpdate(b);
  };

  const handleHeadersCodeChange = (headersCode) => {
    let b = shallowBlockClone(block);
    b.spec.headers_code = headersCode;
    onBlockUpdate(b);
  };

  const handleBodyCodeChange = (bodyCode) => {
    let b = shallowBlockClone(block);
    b.spec.body_code = bodyCode;
    onBlockUpdate(b);
  };

  const handleUrlChange = (url) => {
    let b = shallowBlockClone(block);
    // if url begins with http:// or https://, remove it
    if (url.startsWith("http://")) {
      url = url.substring(7);
      b.spec.scheme = "http";
    }
    if (url.startsWith("https://")) {
      url = url.substring(8);
      b.spec.scheme = "https";
    }
    b.spec.url = url;
    onBlockUpdate(b);
  };

  const handleMethodChange = (method) => {
    let b = shallowBlockClone(block);
    b.spec.method = method;
    onBlockUpdate(b);
  };

  useEffect(() => {
    if (!block.spec.scheme) {
      handleSchemeChange("https");
    }
  });

  return (
    <Block
      user={user}
      app={app}
      spec={spec}
      run={run}
      block={block}
      status={status}
      running={running}
      readOnly={readOnly}
      canUseCache={true}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="flex flex-col mx-4 w-full">
        <div className="flex flex-row space-x-2 mt-1">
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <Menu as="div" className="relative inline-block text-left">
              <div>
                <Menu.Button
                  className={classNames(
                    "inline-flex items-center rounded-md border border-gray-300 bg-gray-50 py-1 px-1 text-sm font-normal",
                    "focus:outline-none focus:ring-0",
                    readOnly ? "cursor-default" : "cursor-pointer"
                  )}
                  readOnly={readOnly}
                >
                  {block.spec.method}
                  <ChevronDownIcon className="h-4 w-4 hover:text-gray-700 mt-0.5" />
                </Menu.Button>
              </div>

              {readOnly ? null : (
                <Menu.Items
                  className={classNames(
                    "absolute shadow left-1 z-10 mt-1 origin-top-left rounded-md bg-white ring-1 ring-black ring-opacity-5 focus:outline-none left-1"
                  )}
                >
                  <div className="py-1">
                    {availableMethods.map((method) => {
                      return (
                        <Menu.Item
                          key={method}
                          onClick={() => handleMethodChange(method)}
                        >
                          {({ active }) => (
                            <span
                              className={classNames(
                                active
                                  ? "bg-gray-50 text-gray-900"
                                  : "text-gray-700",
                                "block px-4 py-1 text-sm cursor-pointer whitespace-nowrap"
                              )}
                            >
                              {method}
                            </span>
                          )}
                        </Menu.Item>
                      );
                    })}
                  </div>
                </Menu.Items>
              )}
            </Menu>
          </div>
          <div className="flex-initial flex flex-row flex-1 items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <div className="flex flex-1 font-normal">
              <div className="flex rounded-md flex-1">
                <span
                  className={classNames(
                    readOnly ? "cursor-default" : "cursor-pointer",
                    "inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-1 text-gray-500 text-sm"
                  )}
                  onClick={() => {
                    if (!readOnly) {
                      if (block.spec.scheme == "https") {
                        handleSchemeChange("http");
                      } else {
                        handleSchemeChange("https");
                      }
                    }
                  }}
                >
                  {block.spec.scheme}://
                </span>
                <input
                  type="text"
                  className={classNames(
                    "block flex-1 rounded-none rounded-r-md font-normal text-sm py-1 pl-1",
                    "border-gray-300 focus:border-gray-300 focus:ring-0"
                  )}
                  readOnly={readOnly}
                  value={block.spec.url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex flex-initial items-center">headers :</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-4">
              <div
                className={classNames(
                  "border bg-slate-100",
                  false ? "border-red-500" : "border-slate-100"
                )}
              >
                <CodeEditor
                  readOnly={readOnly}
                  value={block.spec.headers_code}
                  language="js"
                  placeholder=""
                  onChange={(e) => handleHeadersCodeChange(e.target.value)}
                  padding={15}
                  style={{
                    fontSize: 12,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                    backgroundColor: "rgb(241 245 249)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col text-sm font-medium text-gray-500 leading-8">
          <div className="flex flex-initial items-center">body :</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-4">
              <div
                className={classNames(
                  "border bg-slate-100",
                  false ? "border-red-500" : "border-slate-100"
                )}
              >
                <CodeEditor
                  readOnly={readOnly}
                  value={block.spec.body_code}
                  language="js"
                  placeholder=""
                  onChange={(e) => handleBodyCodeChange(e.target.value)}
                  padding={15}
                  style={{
                    fontSize: 12,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace",
                    backgroundColor: "rgb(241 245 249)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Block>
  );
}
