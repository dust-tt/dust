import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";
import TextareaAutosize from "react-textarea-autosize";
import { useProviders } from "../../../lib/swr";
import { filterServiceProviders } from "../../../lib/providers";
import Link from "next/link";

export default function Search({
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
  let serpAPIProvider = serviceProviders.find((p) => p.providerId == "serpapi");

  // Update the config to impact run state based on the serpAPI provider presence.
  if (!readOnly && !isProvidersLoading && !isProvidersError) {
    if (
      (!block.config.provider_id || block.config.provider_id.length == 0) &&
      serpAPIProvider
    ) {
      setTimeout(() => {
        let b = shallowBlockClone(block);
        b.config.provider_id = "serpapi";
        onBlockUpdate(b);
      });
    }
    if (
      block.config.provider_id &&
      block.config.provider_id.length > 0 &&
      !serpAPIProvider
    ) {
      setTimeout(() => {
        let b = shallowBlockClone(block);
        b.config.provider_id = "";
        onBlockUpdate(b);
      });
    }
  }

  const handleQueryChange = (query) => {
    let b = shallowBlockClone(block);
    b.spec.query = query;
    onBlockUpdate(b);
  };

  const handleNumChange = (num) => {
    let b = shallowBlockClone(block);
    b.spec.num = num;
    onBlockUpdate(b);
  };

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
        <div className="flex flex-col xl:flex-row xl:space-x-2">
          <div className="flex-initial flex flex-row items-center space-x-1 text-sm font-medium text-gray-700 leading-8">
            <div className="flex flex-initial">num:</div>
            <div className="flex flex-initial font-normal">
              <input
                type="text"
                className={classNames(
                  "block flex-1 rounded-md px-1 font-normal text-sm py-1 w-8",
                  readOnly
                    ? "border-white ring-0 focus:ring-0 focus:border-white"
                    : "border-white focus:border-gray-300 focus:ring-0"
                )}
                readOnly={readOnly}
                value={block.spec.num}
                onChange={(e) => handleNumChange(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          <div className="flex-initial flex flex-row items-center space-x-1">
            <div className="flex flex-initial items-center">query:</div>
            {!isProvidersLoading && !serpAPIProvider && !readOnly ? (
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
                  Setup SerpAPI
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex w-full font-normal">
            <input
              type="text"
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
