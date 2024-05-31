import {
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  Icon,
  InformationCircleIcon,
  MagnifyingGlassStrokeIcon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type { WebsearchActionType, WebsearchResultType } from "@dust-tt/types";
import { Transition } from "@headlessui/react";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

import { trimText } from "@app/lib/utils";

export default function WebsearchAction({
  websearchAction,
}: {
  websearchAction: WebsearchActionType;
}) {
  const { query } = websearchAction;

  const [isResultsListVisible, setIsResultsListVisible] = useState(false);

  const { results } = websearchAction.output ?? { results: [] };

  const rawError =
    websearchAction.output && "error" in websearchAction.output
      ? // typescript can't narrow despite the check above
        (websearchAction.output as { error: string }).error
      : null;

  // no results is not an error per se so we won't display it with a red chip
  // but serpApi returns an error so we have to prevent it from being considered
  // as such
  const error = rawError?.includes("Google hasn't returned any results")
    ? null
    : rawError;

  return (
    <>
      <div className="flex flex-row items-center gap-2 pb-2">
        <div className="text-xs font-bold text-element-600">
          Searching&nbsp;Google&nbsp;for:
        </div>
        <Chip.List isWrapping={true}>
          <Tooltip label={`Query used for google search: ${query}`}>
            <Chip color="slate" label={trimText(query)} />
          </Tooltip>
        </Chip.List>
      </div>
      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div className="grid-cols-auto grid items-center">
          {!websearchAction.output ? (
            <div>
              <div className="pb-2 text-xs font-bold text-element-600">
                Searching...
              </div>
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="text-xs font-bold text-element-600">
              <span>Results:</span>
            </div>
          )}
        </div>
        <div className="row-span-1 select-none">
          {websearchAction.output && (
            <div
              onClick={() =>
                results.length > 0 &&
                setIsResultsListVisible(!isResultsListVisible)
              }
              className="cursor-pointer"
            >
              <Chip color="purple">
                {results.length > 0
                  ? SearchResultsInfo(results)
                  : "No results found"}
                {results.length > 0 && (
                  <Icon
                    visual={
                      isResultsListVisible ? ChevronDownIcon : ChevronRightIcon
                    }
                    size="xs"
                  />
                )}
              </Chip>
              {error && (
                <Tooltip label={`Error message: ${error}`}>
                  <Chip color="red">
                    <Icon visual={InformationCircleIcon} size="xs" />
                    Error searching the web
                  </Chip>
                </Tooltip>
              )}
            </div>
          )}
        </div>
        <div className="col-start-2 row-span-1 overflow-hidden">
          {!!results.length && (
            <Transition
              show={isResultsListVisible}
              enter="transition ease-out duration-200 transform"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="transition ease-in duration-75 transform"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <ul className="ml-2 flex flex-col gap-y-2">
                {results.map((result, i) => {
                  return (
                    <li key={i} className="flex flex-col gap-1">
                      <Tooltip label={result.snippet}>
                        <a
                          rel="noopener noreferrer"
                          href={result.link}
                          className="front-bold flex items-center text-xs"
                          target="_blank"
                        >
                          <Icon
                            visual={ExternalLinkIcon}
                            size="xs"
                            className="mr-1 inline-block"
                          />
                          <div className="text-action-800">{result.title}</div>
                        </a>
                        <div className="flex text-xs text-element-700">
                          <Icon
                            visual={ExternalLinkIcon}
                            size="xs"
                            className="mr-1 inline-block opacity-0"
                          />
                          <div className="truncate">{result.snippet}</div>
                        </div>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </Transition>
          )}
        </div>
      </div>
    </>
  );
}

function SearchResultsInfo(searchResults: WebsearchResultType[]) {
  return (
    <div className="flex flex-row items-center">
      <span>
        <Icon
          visual={MagnifyingGlassStrokeIcon}
          size="sm"
          className="mr-1 inline-block"
        />
        {searchResults.length}&nbsp;results
      </span>
    </div>
  );
}
