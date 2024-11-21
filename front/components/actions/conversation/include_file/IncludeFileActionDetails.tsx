import { MagnifyingGlassIcon } from "@dust-tt/sparkle";
import type { ConversationIncludeFileActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function ConversationIncludeFileActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<ConversationIncludeFileActionType>) {
  const { fileTitle } = action;
  return (
    <ActionDetailsWrapper
      actionName="Read conversation file"
      defaultOpen={defaultOpen}
      visual={MagnifyingGlassIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-slate-900">File</span>
          <div className="text-sm font-normal text-slate-500">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-normal text-slate-500">
                Reading file ${fileTitle || "(no title)"}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
