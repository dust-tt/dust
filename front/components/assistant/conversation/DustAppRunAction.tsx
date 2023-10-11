import {
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  Icon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { DustAppRunActionType } from "@app/types/assistant/actions/dust_app_run";

import { RenderMessageMarkdown } from "../RenderMessageMarkdown";

export default function DustAppRunAction({
  dustAppRunAction,
}: {
  dustAppRunAction: DustAppRunActionType;
}) {
  const [outputVisible, setOutputVisible] = useState(false);

  function shortText(text: string, maxLength = 20) {
    const t = text.replaceAll("\n", " ");
    return t.length > maxLength ? t.substring(0, maxLength) + "..." : t;
  }

  function formatOutput(output: unknown) {
    if (!output) {
      return `0 records`;
    }
    if (Array.isArray(output)) {
      return `${output.length} record${
        output.length > 1 || output.length === 0 ? "s" : ""
      }`;
    }
    if (typeof output === "object") {
      const keys = Object.keys(output);
      return `${keys.length} record${
        keys.length > 1 || keys.length === 0 ? "s" : ""
      }`;
    }
    return `1 record`;
  }

  return (
    <>
      <div className="flex flex-row items-center gap-2 pb-2">
        <div className="flex flex-col items-start text-xs font-bold text-element-600">
          <div className="flex">Generated&nbsp;parameters:</div>
        </div>
        <Chip.List isWrapping={true}>
          {Object.keys(dustAppRunAction.params).map((k) => {
            return (
              <Tooltip key={k} label={`${k}: ${dustAppRunAction.params[k]}`}>
                <Chip
                  color="slate"
                  label={shortText(`${k}: ${dustAppRunAction.params[k]}`)}
                />
              </Tooltip>
            );
          })}
        </Chip.List>
      </div>
      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div className="grid-cols-auto grid items-center">
          {!dustAppRunAction.output ? (
            <div>
              <div className="pb-2 text-xs font-bold text-element-600">
                Executing {dustAppRunAction.appName}...
              </div>
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="text-xs font-bold text-element-600">
              <span>Execution output:</span>
            </div>
          )}
        </div>
        {!!dustAppRunAction.output && (
          <div className="row-span-1 select-none">
            <div
              className="cursor-pointer"
              onClick={() => {
                setOutputVisible(!outputVisible);
              }}
            >
              <Chip color="violet">
                {formatOutput(dustAppRunAction.output)}
                <Icon
                  visual={outputVisible ? ChevronDownIcon : ChevronRightIcon}
                  size="xs"
                />
              </Chip>
            </div>
          </div>
        )}
        {outputVisible && (
          <div className="col-start-2 row-span-1 max-h-48 overflow-y-auto rounded-md bg-structure-100">
            <pre className="font-mono whitespace-pre-wrap break-words px-2 py-2 text-xs text-element-700">
              #!/dust/{dustAppRunAction.appName}
              {"\n\n"}
              {JSON.stringify(dustAppRunAction.output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
