import { useState } from "react";
import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";
import TextareaAutosize from "react-textarea-autosize";
import { useProviders } from "../../../lib/swr";
import { filterServiceProviders } from "../../../lib/providers";
import Link from "next/link";

export default function Browser({
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
  let [urlWithoutScheme, setUrlWithoutScheme] = useState(
    block.spec.url.startsWith("https://")
      ? block.spec.url.slice("https://".length)
      : block.spec.url
  );
  let { providers, isProvidersLoading, isProvidersError } = readOnly
    ? {
        providers: [],
        isProvidersLoading: false,
        isProvidersError: false,
      }
    : useProviders();

  let browserlessAPIProvider = providers.find(
    (p) => p.providerId == "browserlessapi"
  );

  // Update the config to impact run state based on the serpAPI provider presence.
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

  const handleUrlBlur = (url) => {
    if (url.startsWith("https://")) {
      handleUrlChange(url.slice("https://".length));
    }
  };

  const handleUrlChange = (url) => {
    let b = shallowBlockClone(block);
    b.spec.url = url ? "https://" + url : "";
    setUrlWithoutScheme(url);
    onBlockUpdate(b);
  };

  const handleSelectorChange = (selector) => {
    let b = shallowBlockClone(block);
    b.spec.selector = selector;
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
      canUseCache={true}
      onBlockUpdate={onBlockUpdate}
      onBlockDelete={onBlockDelete}
      onBlockUp={onBlockUp}
      onBlockDown={onBlockDown}
    >
      <div className="flex flex-col mx-4 w-full">
        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex-initial flex flex-row items-center space-x-1">
            {!isProvidersLoading && !browserlessAPIProvider && !readOnly ? (
              <div className="px-2">
                <Link href={`/${user}/providers`}>
                  <a
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
                  </a>
                </Link>
              </div>
            ) : null}
          </div>
          <div className="flex w-full font-normal">
            <div className="flex rounded-md flex-1">
              Scrape this URL&nbsp;
              <span
                className={classNames(
                  readOnly ? "cursor-default" : "cursor-pointer",
                  "inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-1 text-gray-500 text-sm"
                )}
              >
                https://
              </span>
              <input
                type="text"
                className={classNames(
                  "block flex-1 rounded-none rounded-r-md font-normal text-sm py-1 pl-1",
                  !urlWithoutScheme
                    ? "border-orange-400 focus:border-orange-400 focus:ring-0"
                    : "border-gray-300 focus:border-gray-300 focus:ring-0"
                )}
                readOnly={readOnly}
                value={urlWithoutScheme}
                onChange={(e) => handleUrlChange(e.target.value)}
                onBlur={(e) => handleUrlBlur(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-row ">
            <div className="whitespace-nowrap font-normal">
              Return the content from this CSS selector&nbsp;
            </div>
            <TextareaAutosize
              placeholder=""
              className={classNames(
                "block w-full resize-none rounded-md px-1 font-normal text-sm py-1 font-mono bg-slate-100",
                readOnly
                  ? "border-white ring-0 focus:ring-0 focus:border-white"
                  : block.spec.selector
                  ? "border-white focus:border-gray-300 focus:ring-0"
                  : "border-orange-400 focus:border-orange-400 focus:ring-0"
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
