import {
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  Icon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type { TablesQueryActionType } from "@dust-tt/types";
import dynamic from "next/dynamic";
import { useState } from "react";
import { amber, emerald, slate } from "tailwindcss/colors";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Light),
  { ssr: false }
);

export default function TablesQueryAction({
  tablesQueryAction,
}: {
  tablesQueryAction: TablesQueryActionType;
}) {
  const [isOutputExpanded, setIsOutputExpanded] = useState(false);

  // Extracting question from the params
  const params = tablesQueryAction.params;
  const question =
    typeof params?.question === "string" ? params.question : null;

  // Extracting query and result from the output
  const output = tablesQueryAction.output;
  const query = typeof output?.query === "string" ? output.query : null;
  const noQuery = output?.no_query === true;
  const results = output?.results;

  const isQueryStepCompleted = noQuery || query;
  const isOutputStepCompleted = noQuery || (query && results);

  const trimText = (text: string, maxLength = 20) => {
    const t = text.replaceAll("\n", " ");
    return t.length > maxLength ? t.substring(0, maxLength) + "..." : t;
  };

  return (
    <>
      {question && (
        <div className="flex flex-row items-center gap-2 pb-2">
          <div className="flex flex-col items-start text-xs font-bold text-element-600">
            <div className="flex">Question:</div>
          </div>
          <Tooltip label={question}>
            <Chip color="slate" label={trimText(question)} />
          </Tooltip>
        </div>
      )}

      {!isQueryStepCompleted && (
        <div>
          <div className="pb-2 text-xs font-bold text-element-600">
            Generating query...
          </div>
          <Spinner size="sm" />
        </div>
      )}

      {isQueryStepCompleted && (
        <div className="grid grid-cols-[auto,1fr] gap-2 pb-2">
          <div className="grid-cols-auto grid items-center">
            <div className="text-xs font-bold text-element-600">
              <span>Query:</span>
            </div>
          </div>
          <div className="row-span-1 select-none">
            <div
              className="cursor-pointer"
              onClick={() => {
                setIsOutputExpanded(!isOutputExpanded);
              }}
            >
              <Chip color="purple">
                {query ? query : "No query generated"}
                {(noQuery || results) && (
                  <Icon
                    visual={
                      isOutputExpanded ? ChevronDownIcon : ChevronRightIcon
                    }
                    size="xs"
                  />
                )}
              </Chip>
            </div>
          </div>
          {isOutputExpanded && (
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
                  },
                  hljs: {
                    display: "block",
                    overflowX: "auto",
                    color: slate["700"],
                    padding: "1em",
                  },
                }}
                language={"json"}
                PreTag="div"
              >
                {JSON.stringify(output, null, 2)}
              </SyntaxHighlighter>
            </div>
          )}
        </div>
      )}
      {isQueryStepCompleted && !isOutputStepCompleted && (
        <div>
          <div className="pb-2 text-xs font-bold text-element-600">
            Running query...
          </div>
          <Spinner size="sm" />
        </div>
      )}
    </>
  );
}
