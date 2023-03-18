import { useState } from "react";
import Block from "./Block";
import { classNames, shallowBlockClone } from "@app/lib/utils";
import { useProviders } from "@app/lib/swr";
import { filterServiceProviders } from "@app/lib/providers";
import Link from "next/link";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";

export default function Browser({
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
  let { providers, isProvidersLoading, isProvidersError } = readOnly
    ? {
        providers: [],
        isProvidersLoading: false,
        isProvidersError: false,
      }
    : useProviders();

  let serviceProviders = filterServiceProviders(providers);
  let browserlessAPIProvider = serviceProviders.find(
    (p) => p.providerId == "browserlessapi"
  );

  // Update the config to impact run state based on the BrowserlessAPI provider presence.
  if (!readOnly && !isProvidersLoading && !isProvidersError) {
    if (
      (!block.config.provider_id || block.config.provider_id.length == 0) &&
      browserlessAPIProvider
    ) {
      setTimeout(() => {
        let b = shallowBlockClone(block);
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
        let b = shallowBlockClone(block);
        b.config.provider_id = "";
        onBlockUpdate(b);
      });
    }
  }

  const handleUrlChange = (url) => {
    let b = shallowBlockClone(block);
    b.spec.url = url;
    onBlockUpdate(b);
  };

  const handleSelectorChange = (selector) => {
    let b = shallowBlockClone(block);
    b.spec.selector = selector;
    onBlockUpdate(b);
  };

  const handleTimeoutChange = (timeout) => {
    let b = shallowBlockClone(block);
    b.spec.timeout = timeout;
    onBlockUpdate(b);
  };

  const handleWaitUntilChange = (wait_until) => {
    let b = shallowBlockClone(block);
    b.spec.wait_until = wait_until;
    onBlockUpdate(b);
  };

  const handleWaitForChange = (wait_for) => {
    let b = shallowBlockClone(block);
    b.spec.wait_for = wait_for;
    onBlockUpdate(b);
  };

  const handleErrorAsOutputChange = (error_as_output) => {
    let b = shallowBlockClone(block);
    b.config.error_as_output = error_as_output;
    onBlockUpdate(b);
  };

  const [advancedExpanded, setAdvancedExpanded] = useState(false);

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
        <div className="flex flex-col text-sm font-medium text-gray-500 leading-8">
          {advancedExpanded ? (
            <div
              onClick={() => setAdvancedExpanded(false)}
              className="flex flex-initial items-center font-bold -ml-5 cursor-pointer w-24"
            >
              <span>
                <ChevronDownIcon className="h-4 w-4 mt-0.5 mr-1" />
              </span>
              advanced
            </div>
          ) : (
            <div
              onClick={() => setAdvancedExpanded(true)}
              className="flex flex-initial items-center font-bold -ml-5 cursor-pointer w-24"
            >
              <span>
                <ChevronRightIcon className="h-4 w-4 mt-0.5 mr-1" />
              </span>
              advanced
            </div>
          )}
          {advancedExpanded ? (
            <div className="flex flex-col">
              <div className="flex flex-col xl:flex-row xl:space-x-2">
                <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
                  <div className="flex flex-initial">error as output:</div>
                  <div className="flex flex-initial font-normal">
                    <input
                      type="checkbox"
                      className={classNames(
                        "w-4 h-4 text-violet-600 bg-gray-100 border-gray-300 rounded focus:ring-white focus:ring-2 ml-1 mr-4",
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
                <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
                  <div className="flex flex-initial">timeout:</div>
                  <div className="flex flex-initial font-normal">
                    <input
                      type="text"
                      className={classNames(
                        "block flex-1 rounded-md px-1 font-normal text-sm py-1 w-16",
                        readOnly
                          ? "border-white ring-0 focus:ring-0 focus:border-white"
                          : "border-white focus:border-gray-300 focus:ring-0"
                      )}
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.spec.timeout}
                      onChange={(e) => handleTimeoutChange(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
                  <div className="flex flex-initial">wait until:</div>
                  <div className="flex flex-initial font-normal">
                    <input
                      type="text"
                      className={classNames(
                        "block flex-1 rounded-md px-1 font-normal text-sm py-1 w-32",
                        readOnly
                          ? "border-white ring-0 focus:ring-0 focus:border-white"
                          : "border-white focus:border-gray-300 focus:ring-0"
                      )}
                      spellCheck={false}
                      readOnly={readOnly}
                      value={block.spec.wait_until}
                      onChange={(e) => handleWaitUntilChange(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-1 flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
                  <div className="flex flex-initial">wait for:</div>
                  <div className="flex flex-1 font-normal">
                    <input
                      type="text"
                      placeholder=""
                      className={classNames(
                        "block flex-1 rounded-md px-1 font-normal text-sm py-1 w-32",
                        readOnly
                          ? "border-white ring-0 focus:ring-0 focus:border-white"
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

        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex-initial flex flex-row items-center space-x-1">
            <div className="flex flex-initial items-center">
              URL (with scheme):
            </div>
            {!isProvidersLoading && !browserlessAPIProvider && !readOnly ? (
              <div className="px-2">
                <Link
                  href={`/${user}/providers`}
                  className={classNames(
                    "inline-flex items-center rounded-md py-1 text-sm font-normal",
                    "border px-3",
                    readOnly
                      ? "text-gray-300 border-white"
                      : "text-gray-700 border-orange-400",
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
                "block w-full resize-none px-1 font-normal py-1 text-[13px] font-mono bg-slate-100",
                readOnly
                  ? "border-white ring-0 focus:ring-0 focus:border-white"
                  : "border-white focus:border-white focus:ring-0"
              )}
              spellCheck={false}
              readOnly={readOnly}
              value={block.spec.url}
              onChange={(e) => handleUrlChange(e.target.value)}
            />
          </div>

          <div className="flex-initial flex flex-row items-center space-x-1">
            <div className="flex flex-initial items-center">CSS selector:</div>
          </div>
          <div className="flex w-full font-normal">
            <input
              type="text"
              placeholder=""
              className={classNames(
                "block w-full resize-none px-1 font-normal text-[13px] font-mono py-1 bg-slate-100",
                readOnly
                  ? "border-white ring-0 focus:ring-0 focus:border-white"
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
