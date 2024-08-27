import { ChevronDownIcon, ChevronRightIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type {
  AppType,
  SpecificationBlockType,
  SpecificationType,
} from "@dust-tt/types";
import type { BlockType, RunType } from "@dust-tt/types";
import Link from "next/link";
import { useState } from "react";

import { filterServiceProviders } from "@app/lib/providers";
import { useProviders } from "@app/lib/swr";
import { classNames, shallowBlockClone } from "@app/lib/utils";

import Block from "./Block";

export default function Browser({
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
  const { providers, isProvidersLoading, isProvidersError } = useProviders({
    owner,
    disabled: readOnly,
  });

  const serviceProviders = filterServiceProviders(providers);
  const browserlessAPIProvider = serviceProviders.find(
    (p) => p.providerId == "browserlessapi"
  );

  // Update the config to impact run state based on the BrowserlessAPI provider presence.
  if (!readOnly && !isProvidersLoading && !isProvidersError) {
    if (
      (!block.config.provider_id || block.config.provider_id.length == 0) &&
      browserlessAPIProvider
    ) {
      setTimeout(() => {
        const b = shallowBlockClone(block);
        b.config.provider_id = "browserlessapi";
        onBlockUpdate(b);
      });
    }
    if (
      block.config.provider_id &&
      block.config.provider_id.length > 0 &&
      !browserlessAPIProvider
    ) {
      setTimeout(() => {
        const b = shallowBlockClone(block);
        b.config.provider_id = "";
        onBlockUpdate(b);
      });
    }
  }

  const handleUrlChange = (url: string) => {
    const b = shallowBlockClone(block);
    b.spec.url = url;
    onBlockUpdate(b);
  };

  const handleSelectorChange = (selector: string) => {
    const b = shallowBlockClone(block);
    b.spec.selector = selector;
    onBlockUpdate(b);
  };

  const handleTimeoutChange = (timeout: string) => {
    const b = shallowBlockClone(block);
    b.spec.timeout = timeout;
    onBlockUpdate(b);
  };

  const handleWaitUntilChange = (wait_until: string) => {
    const b = shallowBlockClone(block);
    b.spec.wait_until = wait_until;
    onBlockUpdate(b);
  };

  const handleWaitForChange = (wait_for: string) => {
    const b = shallowBlockClone(block);
    b.spec.wait_for = wait_for;
    onBlockUpdate(b);
  };

  const handleErrorAsOutputChange = (error_as_output: boolean) => {
    const b = shallowBlockClone(block);
    b.config.error_as_output = error_as_output;
    onBlockUpdate(b);
  };

  const [advancedExpanded, setAdvancedExpanded] = useState(false);

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
        <div className="flex flex-col text-sm font-medium leading-8 text-gray-500">
          {advancedExpanded ? (
            <div
              onClick={() => setAdvancedExpanded(false)}
              className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
            >
              <span>
                <ChevronDownIcon className="mr-1 mt-0.5 h-4 w-4" />
              </span>
              advanced
            </div>
          ) : (
            <div
              onClick={() => setAdvancedExpanded(true)}
              className="-ml-5 flex w-24 flex-initial cursor-pointer items-center font-bold"
            >
              <span>
                <ChevronRightIcon className="mr-1 mt-0.5 h-4 w-4" />
              </span>
              advanced
            </div>
          )}
          {advancedExpanded ? (
            <div className="flex flex-col">
              <div className="flex flex-col xl:flex-row xl:space-x-2">
                <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                  <div className="flex flex-initial">error as output:</div>
                  <div className="flex flex-initial font-normal">
                    <input
                      type="checkbox"
                      className={classNames(
                        "ml-1 mr-4 h-4 w-4 rounded border-gray-300 bg-gray-100 text-action-600 focus:ring-2 focus:ring-white",
                        readOnly ? "" : "cursor-pointer"
                      )}
                      checked={block.config.error_as_output}
                      onClick={(e) => {
                        if (readOnly) {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => {
                        handleErrorAsOutputChange(e.target.checked);
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                  <div className="flex flex-initial">timeout:</div>
                  <div className="flex flex-initial font-normal">
                    <input
                      type="text"
                      className={classNames(
                        "block w-16 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                        readOnly
                          ? "border-white ring-0 focus:border-white focus:ring-0"
                          : "border-white focus:border-gray-300 focus:ring-0"
                      )}
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.spec.timeout}
                      onChange={(e) => handleTimeoutChange(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-initial flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                  <div className="flex flex-initial">wait until:</div>
                  <div className="flex flex-initial font-normal">
                    <input
                      type="text"
                      className={classNames(
                        "block w-32 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                        readOnly
                          ? "border-white ring-0 focus:border-white focus:ring-0"
                          : "border-white focus:border-gray-300 focus:ring-0"
                      )}
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.spec.wait_until}
                      onChange={(e) => handleWaitUntilChange(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-1 flex-row items-center space-x-1 text-sm font-medium leading-8 text-gray-700">
                  <div className="flex flex-initial">wait for:</div>
                  <div className="flex flex-1 font-normal">
                    <input
                      type="text"
                      placeholder=""
                      className={classNames(
                        "block w-32 flex-1 rounded-md px-1 py-1 text-sm font-normal",
                        readOnly
                          ? "border-white ring-0 focus:border-white focus:ring-0"
                          : "border-white focus:border-gray-300 focus:ring-0"
                      )}
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.spec.wait_for}
                      onChange={(e) => handleWaitForChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col space-y-1 text-sm font-medium leading-8 text-gray-700">
          <div className="flex flex-initial flex-row items-center space-x-1">
            <div className="flex flex-initial items-center">
              URL (with scheme):
            </div>
            {!isProvidersLoading && !browserlessAPIProvider && !readOnly ? (
              <div className="px-2">
                <Link
                  href={`/w/${owner.sId}/a`}
                  className={classNames(
                    "inline-flex items-center rounded-md py-1 text-sm font-normal",
                    "border px-3",
                    readOnly
                      ? "border-white text-gray-300"
                      : "border-orange-400 text-gray-700",
                    "focus:outline-none focus:ring-0"
                  )}
                >
                  Setup Browserless API
                </Link>
              </div>
            ) : null}
          </div>
          <div className="flex w-full font-normal">
            <input
              type="text"
              placeholder=""
              className={classNames(
                "font-mono block w-full resize-none bg-slate-100 px-1 py-1 text-[13px] font-normal",
                readOnly
                  ? "border-white ring-0 focus:border-white focus:ring-0"
                  : "border-white focus:border-white focus:ring-0"
              )}
              spellCheck={false}
              readOnly={readOnly}
              value={block.spec.url}
              onChange={(e) => handleUrlChange(e.target.value)}
            />
          </div>

          <div className="flex flex-initial flex-row items-center space-x-1">
            <div className="flex flex-initial items-center">CSS selector:</div>
          </div>
          <div className="flex w-full font-normal">
            <input
              type="text"
              placeholder=""
              className={classNames(
                "font-mono block w-full resize-none bg-slate-100 px-1 py-1 text-[13px] font-normal",
                readOnly
                  ? "border-white ring-0 focus:border-white focus:ring-0"
                  : "border-white focus:border-white focus:ring-0"
              )}
              readOnly={readOnly}
              value={block.spec.selector}
              onChange={(e) => handleSelectorChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Block>
  );
}
