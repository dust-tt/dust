import {
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import { DatabaseQueryActionType } from "@dust-tt/types";
import dynamic from "next/dynamic";
import { useState } from "react";
import { amber, emerald, slate } from "tailwindcss/colors";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Light),
  { ssr: false }
);

export default function DatabaseQueryAction({
  databaseQueryAction,
}: {
  databaseQueryAction: DatabaseQueryActionType;
}) {
  const [outputVisible, setOutputVisible] = useState(false);

  return (
    <>
      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div className="grid-cols-auto grid items-center">
          {!databaseQueryAction.output ? (
            <div>
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="text-xs font-bold text-element-600">
              <span>Query Executed:</span>
            </div>
          )}
        </div>
        {!!databaseQueryAction.output && (
          <div className="row-span-1 select-none">
            <div
              className="cursor-pointer"
              onClick={() => {
                setOutputVisible(!outputVisible);
              }}
            >
              <Chip color="purple">
                {databaseQueryAction.output.query}
                <Icon
                  visual={outputVisible ? ChevronDownIcon : ChevronRightIcon}
                  size="xs"
                />
              </Chip>
            </div>
          </div>
        )}
        {outputVisible && (
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
              {JSON.stringify(databaseQueryAction.output, null, 2)}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </>
  );
}
