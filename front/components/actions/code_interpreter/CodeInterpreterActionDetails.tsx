import { CommandLineIcon } from "@dust-tt/sparkle";
import type { CodeInterpreterActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import { ReadOnlyTextArea } from "@app/components/assistant/ReadOnlyTextArea";

export function CodeInterpreterActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<CodeInterpreterActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Code Interpreter"
      defaultOpen={defaultOpen}
      visual={CommandLineIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-normal text-slate-500">
            <ReadOnlyTextArea
              content={action.output?.code ?? "// No code was generated"}
            />
          </div>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
