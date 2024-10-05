import { ClipboardIcon, Hoverable, Tooltip } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { AppType, SpecificationBlockType } from "@dust-tt/types";
import type { TraceType } from "@dust-tt/types";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";

import { useRunBlock } from "@app/lib/swr/apps";

const ENABLE_TOP_LEVEL_AUTO_EXPAND = false;

export function ObjectViewer({
  block,
  value,
}: {
  block: SpecificationBlockType | null;
  value: any;
}) {
  return (
    <div className="flex flex-col">
      {Object.keys(value).map((key) => (
        <ValueViewer
          key={key}
          block={block}
          value={value[key]}
          k={key}
          topLevel={false}
        />
      ))}
    </div>
  );
}

export function ArrayViewer({
  block,
  value,
}: {
  block: SpecificationBlockType | null;
  value: any[];
}) {
  return (
    <div className="flex flex-col">
      {value.map((item, index) => (
        <ValueViewer
          key={index}
          block={block}
          value={item}
          k={index}
          topLevel={false}
        />
      ))}
    </div>
  );
}

function ValueViewer({
  block,
  value,
  k,
  topLevel,
}: {
  block: SpecificationBlockType | null;
  value: any;
  k: string | number | null;
  topLevel: boolean;
}) {
  const summary = (value: any) => {
    if (Array.isArray(value)) {
      return `[ ${value.length} items ]`;
    }
    if (typeof value === "object" && value !== null) {
      return `{ ${Object.keys(value).join(", ")} }`;
    }
    return value;
  };

  const isExpandable = (value: any) => {
    return (
      Array.isArray(value) || (typeof value === "object" && value !== null)
    );
  };

  const autoExpand = (value: any) => {
    if (topLevel && !ENABLE_TOP_LEVEL_AUTO_EXPAND) {
      return false;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      let flat = true;
      const keys = Object.keys(value);
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
            <div className="flex-initial cursor-pointer text-gray-400">
              {expanded ? (
                <div onClick={() => setExpanded(false)}>
                  <span className="flex flex-row items-center">
                    <ChevronDownIcon className="mt-0.5 h-4 w-4" />
                    {k != null ? (
                      <span className="mr-1 font-bold text-gray-700">{k}:</span>
                    ) : null}
                    <span className="text-gray-400">{summary(value)}</span>
                  </span>
                </div>
              ) : (
                <div onClick={() => setExpanded(true)}>
                  <span className="flex flex-row items-center">
                    <ChevronRightIcon className="mt-0.5 h-4 w-4" />
                    {k != null ? (
                      <span className="mr-1 font-bold text-gray-700">{k}:</span>
                    ) : null}
                    <span className="text-gray-400">{summary(value)}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
          {expanded ? (
            <div className="ml-4 flex">
              {Array.isArray(value) ? (
                <ArrayViewer value={value} block={block} />
              ) : typeof value == "object" ? (
                <ObjectViewer value={value} block={block} />
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="ml-2 flex text-sm text-gray-600">
          {k != null ? (
            <span className="ml-2 mr-1 font-bold text-gray-700">{k}:</span>
          ) : null}
          <span className="whitespace-pre-wrap">
            {typeof value === "string" ? (
              <StringViewer value={value} />
            ) : typeof value === "boolean" ? (
              value ? (
                <span className="italic">true</span>
              ) : (
                <span className="italic">false</span>
              )
            ) : (
              value
            )}
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
export function StringViewer({ value }: { value: any }) {
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
          className="cursor-pointer font-bold text-action-600 hover:text-action-500"
          onClick={() => setExpanded(!expanded)}
        >
          show all
        </span>
      </span>
    );
  }
}

function Error({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="flex flex-row items-center text-sm">
        <div className="flex-initial cursor-pointer text-gray-400">
          {expanded ? (
            <div onClick={() => setExpanded(false)}>
              <span className="flex flex-row items-center">
                <ChevronDownIcon className="mt-0.5 h-4 w-4" />
                <span className="text-sm italic text-gray-400">error</span>
              </span>
            </div>
          ) : (
            <div onClick={() => setExpanded(true)}>
              <span className="flex flex-row items-center">
                <ChevronRightIcon className="mt-0.5 h-4 w-4" />
                <span className="text-sm italic text-gray-400">error</span>
              </span>
            </div>
          )}
        </div>
      </div>
      {expanded ? (
        <div className="ml-4 flex text-sm text-red-400">
          <div className="flex-auto">{error.split(" (sandboxed.js")[0]}</div>
        </div>
      ) : null}
    </div>
  );
}

export function Execution({
  block,
  trace,
}: {
  block: SpecificationBlockType | null;
  trace: TraceType[];
}) {
  return (
    <div className="flex flex-auto flex-col overflow-hidden">
      {trace.map((t, i) => {
        return (
          <div key={i} className="flex-auto flex-col">
            {t.error != null ? (
              <div className="flex flex-auto flex-row">
                <ExclamationCircleIcon className="mt-0.5 flex h-4 w-4 text-red-400" />
                <Error error={t.error} />
              </div>
            ) : (
              <div className="flex flex-row">
                <div className="flex flex-initial">
                  <CheckCircleIcon className="min-w-4 mt-0.5 h-4 w-4 text-emerald-300" />
                </div>
                <div className="flex flex-1">
                  <ValueViewer
                    block={block}
                    value={t.value}
                    topLevel={true}
                    k={null}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function InnerLogs({ trace }: { trace: TraceType }) {
  const meta =
    (trace.meta as
      | {
          logs: any[];
          provider_request_id?: string;
          token_usage?: {
            prompt_tokens: number;
            completion_tokens: number;
          };
        }
      | undefined) || null;

  const logs = [...(meta?.logs || [])];
  if (meta && meta.provider_request_id) {
    logs.push({ provider_request_id: meta.provider_request_id });
  }
  if (meta && meta.token_usage) {
    logs.push(meta.token_usage);
  }

  return (
    <div className="flex flex-row">
      <div className="flex flex-initial">
        <InformationCircleIcon className="min-w-4 mt-0.5 h-4 w-4 text-gray-400" />
      </div>
      <div className="font-mono flex flex-1">
        <ValueViewer value={logs} topLevel={true} k={null} block={null} />
      </div>
    </div>
  );
}

export function Logs({ trace }: { trace: TraceType[] }) {
  return (
    <div className="flex flex-auto flex-col overflow-hidden">
      {trace.map((t, i) => {
        return (
          <div key={i} className="flex-auto flex-col">
            <InnerLogs trace={t} />
          </div>
        );
      })}
    </div>
  );
}

const JsonCopyLink = ({ value }: { value: string }) => {
  const [copyCount, setCopyCount] = useState(0);
  const copied = copyCount > 0;

  useEffect(() => {
    if (copyCount > 0) {
      const timeout = setTimeout(() => setCopyCount(0), 1000);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [copyCount]);

  const handleClick = () => {
    setCopyCount(1);
    void navigator.clipboard.writeText(value);
  };

  return (
    <div className="items-top mr-3 flex">
      {copied ? (
        <div className="text-sm text-gray-400">Copied!</div>
      ) : (
        <Tooltip
          label="Copy JSON to clipboard"
          trigger={
            <Hoverable
              className="cursor-pointer text-sm font-bold text-gray-400"
              onClick={handleClick}
            >
              <ClipboardIcon />
            </Hoverable>
          }
        />
      )}
    </div>
  );
};

export default function Output({
  owner,
  block,
  runId,
  app,
}: {
  owner: WorkspaceType;
  block: SpecificationBlockType;
  runId: string;
  app: AppType;
}) {
  const { run } = useRunBlock(
    owner,
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

  const [expandedResult, setExpandedResult] = useState(false);
  const [expandedLog, setExpandedLog] = useState(false);

  if (
    run &&
    run.traces.length > 0 &&
    run.traces[0].length > 0 &&
    run.traces[0][1].length > 0 &&
    !["reduce", "end"].includes(block.type)
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
        return (input[0].value as unknown[]).map((v) => {
          return { value: v, error: null, meta: null } as TraceType;
        });
      });
    }

    const successes = traces.reduce((acc, t) => {
      return acc + t.filter((t) => t.error === null).length;
    }, 0);
    const errors = traces.reduce((acc, t) => {
      return acc + t.filter((t) => t.error !== null).length;
    }, 0);
    const logs = traces.reduce((acc, t) => {
      return (
        acc +
        t.filter(
          (t) =>
            t.meta &&
            (((t.meta as { logs: any[] }).logs &&
              (t.meta as { logs: any[] }).logs.length) ||
              (t.meta as { provider_request_id?: string })
                .provider_request_id ||
              (
                t.meta as {
                  token_usage?: {
                    completion_tokes: number;
                    prompt_tokens: number;
                  };
                }
              ).token_usage)
        ).length
      );
    }, 0);

    return (
      <div>
        {logs ? (
          <div className="flex flex-auto flex-col">
            <div className="flex flex-row items-center text-sm">
              <div className="flex-initial cursor-pointer text-gray-400">
                <div onClick={() => setExpandedLog(!expandedLog)}>
                  <span className="flex flex-row items-center">
                    {expandedLog ? (
                      <ChevronDownIcon className="mt-0.5 h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="mt-0.5 h-4 w-4" />
                    )}
                    <span className="text-sm text-gray-400">
                      [{" "}
                      <span className="text font-bold">
                        {logs} {logs === 1 ? "log" : "logs"}
                      </span>
                      ]
                    </span>
                  </span>
                </div>
              </div>
            </div>
            {expandedLog ? (
              <>
                {/* Expand all logs for the traces and then flatten,  .flat().flat() is not clean... */}
                {traces.map((trace, i) => {
                  if (
                    trace
                      .map((t) => t.meta)
                      .some(
                        (e) =>
                          (e as { logs: any[] }).logs.length ||
                          (e as { provider_request_id?: string })
                            .provider_request_id ||
                          (
                            e as {
                              token_usage?: {
                                completion_tokes: number;
                                prompt_tokens: number;
                              };
                            }
                          ).token_usage
                      )
                  ) {
                    return (
                      <div key={i} className="ml-1 flex flex-auto flex-row">
                        <div className="font-mono mr-2 flex text-sm text-gray-300">
                          {i}:
                        </div>
                        <Logs trace={trace} />
                      </div>
                    );
                  }
                })}
              </>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-auto flex-col">
          <div className="flex flex-row items-center text-sm">
            <div className="w-full flex-initial cursor-pointer text-gray-400">
              <div className="flex w-full flex-row items-center justify-between">
                <div
                  className="flex flex-row items-center"
                  onClick={() => setExpandedResult(!expandedResult)}
                >
                  {expandedResult ? (
                    <ChevronDownIcon className="mt-0.5 h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="mt-0.5 h-4 w-4" />
                  )}
                  <span className="text-sm text-gray-400">
                    [{" "}
                    <span className="font-bold text-emerald-400">
                      {successes} {successes === 1 ? "success" : "successes"}
                    </span>
                    {errors > 0 ? (
                      <>
                        {", "}
                        <span className="font-bold text-red-400">
                          {errors} {errors === 1 ? "error" : "errors"}
                        </span>
                      </>
                    ) : null}{" "}
                    ]
                  </span>
                </div>
                <JsonCopyLink value={JSON.stringify(traces)} />
              </div>
            </div>
          </div>
          {expandedResult ? (
            <>
              <div className="my-0.5" />
              {traces.map((trace, i) => {
                return (
                  <div key={i} className="ml-1 flex flex-auto flex-row">
                    <div className="font-mono mr-2 flex text-sm text-gray-300">
                      {i}:
                    </div>
                    <Execution trace={trace} block={block} />
                    <JsonCopyLink value={JSON.stringify(trace)} />
                  </div>
                );
              })}
            </>
          ) : null}
        </div>
      </div>
    );
  } else {
    return <></>;
  }
}
