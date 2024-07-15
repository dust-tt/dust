import { CommandLineIcon } from "@dust-tt/sparkle";
import type { VisualizationActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import { ReadOnlyTextArea } from "@app/components/assistant/ReadOnlyTextArea";

export function VisualizationActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<VisualizationActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Visualization"
      defaultOpen={defaultOpen}
      visual={CommandLineIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-normal text-slate-500">
            <div>arico</div>
            <ReadOnlyTextArea content={action.generation ?? ""} />
          </div>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
