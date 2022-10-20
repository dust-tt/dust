import Block from "./Block";
import { classNames, shallowBlockClone } from "../../../lib/utils";
import { useProviders } from "../../../lib/swr";
import { Menu, Transition } from "@headlessui/react";
import Link from "next/link";
import SerpApiSetup from "../../providers/SerpApiSetup";
import { useState } from "react";

export default function GoogleAnswer({
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
  let { providers, isProvidersLoading, isProvidersError } = useProviders();
  if (readOnly) {
    providers = [];
    isProvidersLoading = false;
    isProvidersError = false;
  }
  const [serpApiOpen, setSerpApiOpen] = useState(false);

  const handleQuestionChange = (question) => {
    let b = shallowBlockClone(block);
    b.spec.question = question;
    onBlockUpdate(b);
  };

  const serpApiProvider =
    !isProvidersLoading &&
    !isProvidersError &&
    providers.filter(({ providerId }) => providerId === "serpapi").length > 0
      ? providers.filter(({ providerId }) => providerId === "serpapi")[0]
      : null;
  const serpApiProviderConfig = serpApiProvider
    ? JSON.parse(serpApiProvider.config)
    : null;

  const isSerpApiConfigured =
    !isProvidersLoading &&
    !isProvidersError &&
    serpApiProvider &&
    serpApiProviderConfig &&
    serpApiProviderConfig.api_key;

  //   const serpApiConfig =

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
      <SerpApiSetup
        open={serpApiOpen}
        setOpen={setSerpApiOpen}
        enabled={isSerpApiConfigured}
        config={serpApiProviderConfig}
      />

      <div className="flex flex-col mx-4 w-full">
        <div className="flex flex-col space-y-1 text-sm font-medium text-gray-700 leading-8">
          {isProvidersLoading && <div>Loading SerpApi configuration...</div>}
          {isProvidersError && (
            <div>Error: Unable to load the configuration of SerpApi.</div>
          )}
          {!isSerpApiConfigured ? (
            <>
              <div>
                In order to use the Google Answers block, you need to enter an
                API key from{" "}
                <a
                  className="text-violet-600 hover:text-violet-500 font-bold"
                  href="https://serpapi.com/"
                  target="_blank"
                >
                  SerpApi
                </a>
                .
              </div>
              <Menu as="div" className="relative inline-block text-left">
                <div>
                  <a
                    onClick={(e) => setSerpApiOpen(true)}
                    className={classNames(
                      "inline-flex items-center rounded-md py-1 text-sm font-normal",
                      "border px-3",
                      readOnly
                        ? "text-gray-300 border-white"
                        : "text-gray-700 border-orange-400",
                      "focus:outline-none focus:ring-0"
                    )}
                  >
                    Setup SerpApi API Key
                  </a>
                </div>
              </Menu>
            </>
          ) : (
            <>
              <div className="flex flex-initial">Question for Google:</div>
              <div className="flex flex-initial font-normal">
                <input
                  type="text"
                  className={classNames(
                    "block flex-1 rounded-md px-1 font-normal text-xl py-1 w-8",
                    readOnly
                      ? "border-white ring-0 focus:ring-0 focus:border-white"
                      : "border-white focus:border-gray-300 focus:ring-0"
                  )}
                  readOnly={readOnly}
                  value={block.spec.question}
                  onChange={(e) => handleQuestionChange(e.target.value)}
                />
              </div>
              <div className="text-sm text-slate-400">
                Return values of this block look like &#123; "question": "How
                tall is the Empire State Building?", "answer": "1,454 feet"
                &#125;. If Google does not provide an answer to the question,
                then answer will be null.
              </div>
            </>
          )}
        </div>
      </div>
    </Block>
  );
}
