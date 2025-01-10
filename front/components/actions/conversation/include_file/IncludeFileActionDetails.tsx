import { MagnifyingGlassIcon } from "@dust-tt/sparkle";
import type { ConversationIncludeFileActionType } from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function ConversationIncludeFileActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<ConversationIncludeFileActionType>) {
  console.log(action);
  const { fileTitle } = action;
  return (
    <ActionDetailsWrapper
      actionName="Read conversation file"
      defaultOpen={defaultOpen}
      visual={MagnifyingGlassIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <p className="text-sm font-normal text-muted-foreground">
          {fileTitle || "(no file name available)"}
        </p>
      </div>
    </ActionDetailsWrapper>
  );
}
