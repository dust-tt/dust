import { Collapsible, CommandLineIcon } from "@dust-tt/sparkle";
import type { DustAppRunActionType } from "@dust-tt/types";
import { capitalize } from "lodash";
import { useMemo } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import { CodeBlock } from "@app/components/assistant/RenderMessageMarkdown";
import { ClipboardBanner } from "@app/components/misc/ClipboardBanner";

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

function DustAppRunOutputDetails({ action }: { action: DustAppRunActionType }) {
  if (!action.output) {
    return null;
  }

  const stringifiedOutput = useMemo(
    () => JSON.stringify(action.output, null, 2),
    [action.output]
  );

  return (
    <ClipboardBanner content={stringifiedOutput}>
      <CodeBlock className="language-json" wrapLongLines={true}>
        {stringifiedOutput}
      </CodeBlock>
    </ClipboardBanner>
  );
}
