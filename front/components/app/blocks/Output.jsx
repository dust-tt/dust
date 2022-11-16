import { classNames } from "../../../lib/utils";
import { useRunBlock } from "../../../lib/swr";
import {
  ExclamationCircleIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";

function ObjectViewer({ block, value }) {
  return (
    <div className="flex flex-col">
      {Object.keys(value).map((key, index) => (
        <ValueViewer key={key} block={block} value={value[key]} k={key} />
      ))}
    </div>
  );
}

function ArrayViewer({ block, value }) {
  return (
    <div className="flex flex-col">
      {value.map((item, index) => (
        <ValueViewer key={index} block={block} value={item} k={index} />
      ))}
    </div>
  );
}

function ValueViewer({ block, value, k }) {
  const summary = (value) => {
    if (Array.isArray(value)) {
      return `[ ${value.length} items ]`;
    }
    if (typeof value === "object" && value !== null) {
      return `{ ${Object.keys(value).join(", ")} }`;
    }
    return value;
  };

  const isExpandable = (value) => {
    return (
      Array.isArray(value) || (typeof value === "object" && value !== null)
    );
  };

  const autoExpand = (value) => {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      let flat = true;
      let keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        if (isExpandable(value[keys[i]])) {
          flat = false;
        }
      }
      return flat;
    }
    return false;
  };

  const [expanded, setExpanded] = useState(autoExpand(value));

  return (
    <div>
      {isExpandable(value) ? (
        <>
          <div className="flex flex-row items-center text-sm">
            <div className="flex-initial text-gray-400 cursor-pointer">
              {expanded ? (
                <div onClick={() => setExpanded(false)}>
                  <span className="flex flex-row items-center">
                    <ChevronDownIcon className="h-4 w-4 mt-0.5" />
                    {k != null ? (
                      <span className="text-gray-700 mr-1 font-bold">{k}:</span>
                    ) : null}
                    <span className="text-gray-400">{summary(value)}</span>
                  </span>
                </div>
              ) : (
                <div onClick={() => setExpanded(true)}>
                  <span className="flex flex-row items-center">
                    <ChevronRightIcon className="h-4 w-4 mt-0.5" />
                    {k != null ? (
                      <span className="text-gray-700 mr-1 font-bold">{k}:</span>
                    ) : null}
                    <span className="text-gray-400">{summary(value)}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
          {expanded ? (
            <div className="flex ml-4">
              {Array.isArray(value) ? (
                <ArrayViewer value={value} block={block} />
              ) : typeof value == "object" ? (
                <ObjectViewer value={value} block={block} />
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex text-sm text-gray-600 ml-4">
          {k != null ? (
            <span className="text-gray-700 mr-1 font-bold">{k}:</span>
          ) : null}
          <span className="whitespace-pre-wrap">
            {typeof value === "string" ? <StringViewer value={value} /> : value}
          </span>
        </div>
      )}
    </div>
  );
}

const STRING_SHOW_MORE_LINK_LENGTH = 400;

// This viewer just truncates very long strings with a show all link for
// seeing the full value. It does not currently allow you to hide the
// text again.
function StringViewer({ value }) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return value;
  }

  if (value.length < STRING_SHOW_MORE_LINK_LENGTH) {
    return value;
  } else {
    return (
      <span>
        {value.slice(0, STRING_SHOW_MORE_LINK_LENGTH)}...{" "}
        <span
          className="text-violet-600 hover:text-violet-500 font-bold cursor-pointer"
          onClick={(e) => setExpanded(!expanded)}
        >
          show all
        </span>
      </span>
    );
  }
}

function Error({ error }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="flex flex-row items-center text-sm">
        <div className="flex-initial text-gray-400 cursor-pointer">
          {expanded ? (
            <div onClick={() => setExpanded(false)}>
              <span className="flex flex-row items-center">
                <ChevronDownIcon className="h-4 w-4 mt-0.5" />
                <span className="text-sm text-gray-400 italic">error</span>
              </span>
            </div>
          ) : (
            <div onClick={() => setExpanded(true)}>
              <span className="flex flex-row items-center">
                <ChevronRightIcon className="h-4 w-4 mt-0.5" />
                <span className="text-sm text-gray-400 italic">error</span>
              </span>
            </div>
          )}
        </div>
      </div>
      {expanded ? (
        <div className="flex text-sm text-red-400 ml-4">
          <div className="flex-auto">{error.split(" (sandboxed.js")[0]}</div>
        </div>
      ) : null}
    </div>
  );
}

export default function Output({ user, block, runId, status, app }) {
  let { run, isRunLoading, isRunError } = useRunBlock(
    user,
    app,
    runId,
    block.type,
    block.name,
    (data) => {
      if (data && data.run) {
        switch (data?.run.status.run) {
          case "running":
            return 100;
          default:
            return 0;
        }
      }
      return 0;
    }
  );

  if (
    run &&
    run.traces.length > 0 &&
    run.traces[0].length > 0 &&
    run.traces[0][1].length > 0 &&
    !["reduce"].includes(block.type)
  ) {
    let traces = run.traces[0][1];

    // For `map` blocks, chirurgically transform the outputs when there is no error so that it looks
    // like the map has taken place. The map block applies the map after it is executed as the
    // execution guarantees to return an error or an array that is valid for mapping.
    if ("map" === block.type) {
      traces = traces.map((input) => {
        if (input.find((t) => t.error)) {
          return input;
        }
        return input[0].value.map((v) => {
          return { value: v };
        });
      });
    }

    return (
      <div className="flex flex-col flex-auto">
        {traces.map((trace, i) => {
          return (
            <div key={i} className="flex flex-row flex-auto ml-1">
              <div className="flex text-sm text-gray-300 mr-2">{i}:</div>
              <div className="flex flex-auto flex-col overflow-hidden">
                {trace.map((t, i) => {
                  return (
                    <div key={i} className="flex-auto flex-col">
                      {t.error != null ? (
                        <div className="flex flex-auto flex-row">
                          <ExclamationCircleIcon className="flex h-4 w-4 text-red-400 mt-0.5" />
                          <Error error={t.error} />
                        </div>
                      ) : (
                        <div className="flex flex-row">
                          <div className="flex flex-initial">
                            <CheckCircleIcon className="text-emerald-300 h-4 w-4 min-w-4 mt-0.5" />
                          </div>
                          <div className="flex flex-1">
                            <ValueViewer block={block} value={t.value} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    return <></>;
  }
}
