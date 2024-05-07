import {
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  Icon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ProcessActionType } from "@dust-tt/types";
import { PROCESS_ACTION_TOP_K } from "@dust-tt/types";
import dynamic from "next/dynamic";
import { useState } from "react";
import { amber, emerald, slate } from "tailwindcss/colors";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Light),
  { ssr: false }
);

export default function ProcessAction({
  processAction,
}: {
  processAction: ProcessActionType;
}) {
  const [outputVisible, setOutputVisible] = useState(false);

  const { relativeTimeFrame } = processAction.params;

  const overflow =
    processAction.outputs &&
    processAction.outputs.total_chunks >= PROCESS_ACTION_TOP_K;

  const minProcessingDate =
    processAction.outputs && processAction.outputs.min_timestamp
      ? new Date(processAction.outputs.min_timestamp)
      : null;

  const minProcessingDateStr =
    minProcessingDate &&
    `${minProcessingDate.toLocaleString("default", {
      month: "short",
    })} ${minProcessingDate.getDate()}`;

  return (
    <>
      {processAction.params && Object.keys(processAction.params).length > 0 && (
        <div className="flex flex-row items-center gap-2 pb-2">
          <div className="flex flex-col items-start text-xs font-bold text-element-600">
            <div className="flex">From:</div>
          </div>
          {relativeTimeFrame && (
            <Tooltip label="Documents created or updated during that time are included in the search">
              <Chip
                color="amber"
                label={
                  relativeTimeFrame
                    ? "The last " +
                      (relativeTimeFrame.duration > 1
                        ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
                        : `${relativeTimeFrame.unit}`)
                    : "All time"
                }
              />
            </Tooltip>
          )}
          {processAction.outputs && overflow && (
            <Tooltip
              label={`Too much data to process over time frame. Processed ${processAction.outputs.total_documents} documents (for a total of ${processAction.outputs.total_tokens} tokens) up to to ${minProcessingDateStr}`}
            >
              <Chip
                color="warning"
                label={`Warning: limited procesing (up to to ${minProcessingDateStr})`}
              />
            </Tooltip>
          )}
        </div>
      )}

      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div className="grid-cols-auto grid items-center">
          {!processAction.outputs ? (
            <div>
              <div className="pb-2 text-xs font-bold text-element-600">
                Processing documents...
              </div>
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="text-xs font-bold text-element-600">
              <span>Processing output:</span>
            </div>
          )}
        </div>

        {!!processAction.outputs && (
          <div className="row-span-1 select-none">
            <div
              className="cursor-pointer"
              onClick={() => {
                setOutputVisible(!outputVisible);
              }}
            >
              <Chip color="purple">
                {processAction.outputs.data.length} records
                <Icon
                  visual={outputVisible ? ChevronDownIcon : ChevronRightIcon}
                  size="xs"
                />
              </Chip>
            </div>
          </div>
        )}

        {processAction.outputs && outputVisible && (
          <div className="col-start-2 row-span-1 max-h-48 overflow-auto rounded-md bg-structure-100">
            <SyntaxHighlighter
              className="h-full w-full rounded-md text-xs"
              style={{
                "hljs-number": {
                  color: amber["500"],
                },
                "hljs-literal": {
                  color: amber["500"],
                },
                "hljs-string": {
                  color: emerald["600"],
                  // @ts-expect-error - this is a valid style
                  textWrap: "wrap",
                },
                hljs: {
                  display: "block",
                  color: slate["700"],
                  padding: "1em",
                },
              }}
              language={"json"}
              PreTag="div"
            >
              {JSON.stringify(processAction.outputs.data, null, 2)}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </>
  );
}
