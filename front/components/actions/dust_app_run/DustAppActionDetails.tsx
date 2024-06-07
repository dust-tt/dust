import { Collapsible, CommandLineIcon } from "@dust-tt/sparkle";
import type { DustAppRunActionType } from "@dust-tt/types";
import { capitalize } from "lodash";
import dynamic from "next/dynamic";
import { amber, emerald, slate } from "tailwindcss/colors";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Light),
  { ssr: false }
);

export function DustAppRunActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<DustAppRunActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Run app"
      defaultOpen={defaultOpen}
      visual={CommandLineIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-slate-900">Parameters</span>
          <div className="text-sm font-normal text-slate-500">
            <DustAppRunParamsDetails action={action} />
          </div>
        </div>
        <div>
          <Collapsible defaultOpen={defaultOpen}>
            <Collapsible.Button>
              <span className="text-sm font-bold text-slate-900">Results</span>
            </Collapsible.Button>
            <Collapsible.Panel>
              <DustAppRunOutputDetails action={action} />
            </Collapsible.Panel>
          </Collapsible>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

function DustAppRunParamsDetails({ action }: { action: DustAppRunActionType }) {
  const { params } = action;

  return (
    <div className="flex flex-col gap-0.5">
      {Object.entries(params).map(([k, v], idx) => (
        <p key={idx}>
          <span className="font-semibold">{capitalize(k)}:</span>
          {` ${v}`}
        </p>
      ))}
    </div>
  );
}

type DustAppRunActionWithOutputType = DustAppRunActionType & {
  output: unknown;
};

function hasOutput(
  action: DustAppRunActionType
): action is DustAppRunActionWithOutputType {
  const { output } = action;

  return output !== null && typeof output === "object";
}

function DustAppRunOutputDetails({ action }: { action: DustAppRunActionType }) {
  if (!hasOutput(action)) {
    return null;
  }

  return (
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
        {JSON.stringify(action.output, null, 2)}
      </SyntaxHighlighter>
    </div>
  );
}
