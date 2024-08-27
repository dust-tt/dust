import "@uiw/react-textarea-code-editor/dist.css";

import { ChevronDownIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";
import { Menu } from "@headlessui/react";
import dynamic from "next/dynamic";
import { useEffect } from "react";

import { classNames, shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

const CodeEditor = dynamic(
  () => import("@uiw/react-textarea-code-editor").then((mod) => mod.default),
  { ssr: false }
);

export default function Curl({
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
  const availableMethods = ["GET", "POST", "PUT", "PATCH"];

  const handleSchemeChange = (scheme: string) => {
    const b = shallowBlockClone(block);
    b.spec.scheme = scheme;
    onBlockUpdate(b);
  };

  const handleHeadersCodeChange = (headersCode: string) => {
    const b = shallowBlockClone(block);
    b.spec.headers_code = headersCode;
    onBlockUpdate(b);
  };

  const handleBodyCodeChange = (bodyCode: string) => {
    const b = shallowBlockClone(block);
    b.spec.body_code = bodyCode;
    onBlockUpdate(b);
  };

  const handleUrlChange = (url: string) => {
    const b = shallowBlockClone(block);
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

  const handleMethodChange = (method: string) => {
    const b = shallowBlockClone(block);
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
      owner={owner}
      app={app}
      spec={spec}
      run={run}
      block={block}
      status={status}
      running={running}
      readOnly={readOnly}
      showOutputs={showOutputs}
      canUseCache={true}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
      onBlockNew={onBlockNew}
    >
      <div className="mx-4 flex w-full flex-col">
        <div className="mt-1 flex flex-row space-x-2">
          <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <Menu as="div" className="relative inline-block text-left">
              <div>
                <Menu.Button
                  className={classNames(
                    "inline-flex items-center rounded-md border border-gray-300 bg-gray-50 px-1 py-1 text-sm font-normal",
                    "focus:outline-none focus:ring-0",
                    readOnly ? "cursor-default" : "cursor-pointer"
                  )}
                >
                  {block.spec.method}
                  <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                </Menu.Button>
              </div>

              {readOnly ? null : (
                <Menu.Items
                  className={classNames(
                    "absolute left-1 z-10 mt-1 origin-top-left rounded-md bg-white shadow ring-1 ring-black ring-opacity-5 focus:outline-none"
                  )}
                >
                  <div className="py-1">
                    {availableMethods.map((method) => {
                      return (
                        <Menu.Item key={method}>
                          {({ active }) => (
                            <span
                              className={classNames(
                                active
                                  ? "bg-gray-50 text-gray-900"
                                  : "text-gray-700",
                                "block cursor-pointer whitespace-nowrap px-4 py-1 text-sm"
                              )}
                              onClick={() => handleMethodChange(method)}
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
          <div className="flex w-full flex-1 flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
            <div className="flex flex-1 font-normal">
              <div className="flex flex-1 rounded-md">
                <span
                  className={classNames(
                    readOnly ? "cursor-default" : "cursor-pointer",
                    "inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-1 text-sm text-gray-500"
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
                    "block flex-1 rounded-none rounded-r-md py-1 pl-1 text-sm font-normal",
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
        <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial items-center">headers :</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-4">
              <div
                className={classNames(
                  "border bg-slate-100",
                  "border-slate-100"
                )}
              >
                <CodeEditor
                  data-color-mode="light"
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
        <div className="flex flex-col text-sm font-medium leading-8 text-gray-500">
          <div className="flex flex-initial items-center">body :</div>
          <div className="flex w-full font-normal">
            <div className="w-full leading-4">
              <div
                className={classNames(
                  "border bg-slate-100",
                  "border-slate-100"
                )}
              >
                <CodeEditor
                  data-color-mode="light"
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
