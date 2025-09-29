import {
  Checkbox,
  CollapsibleComponent,
  Label,
  MemoCodeBlockWithExtendedSupport,
} from "@dust-tt/sparkle";

import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { asDisplayName } from "@app/types";

interface ToolValidationDialogPageProps {
  blockedAction: BlockedToolExecution;
  errorMessage: string | null;
  neverAskAgain: boolean;
  setNeverAskAgain: (value: boolean) => void;
}

export function ToolValidationDialogPage({
  blockedAction,
  errorMessage,
  neverAskAgain,
  setNeverAskAgain,
}: ToolValidationDialogPageProps) {
  const hasDetails =
    blockedAction?.inputs && Object.keys(blockedAction.inputs).length > 0;

  return (
    <div className="flex flex-col gap-4 text-muted-foreground dark:text-muted-foreground-night">
      <div>
        Allow{" "}
        <span className="font-semibold">
          @{blockedAction.metadata.agentName}
        </span>{" "}
        to use the tool{" "}
        <span className="font-semibold">
          {asDisplayName(blockedAction.metadata.toolName)}
        </span>{" "}
        from{" "}
        <span className="font-semibold">
          {asDisplayName(blockedAction.metadata.mcpServerName)}
        </span>
        ?
      </div>
      {hasDetails && (
        <CollapsibleComponent
          triggerChildren={<span className="font-medium">Details</span>}
          contentChildren={
            <div className="max-h-80 overflow-auto">
              <MemoCodeBlockWithExtendedSupport className="language-json">
                {JSON.stringify(blockedAction.inputs, null, 2)}
              </MemoCodeBlockWithExtendedSupport>
            </div>
          }
        />
      )}
      {errorMessage && (
        <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
      {blockedAction.stake === "low" && (
        <div className="mt-5">
          <Label className="copy-sm flex w-fit cursor-pointer flex-row items-center gap-2 py-2 pr-2 font-normal">
            <Checkbox
              checked={neverAskAgain}
              onCheckedChange={(check) => {
                setNeverAskAgain(!!check);
              }}
            />
            <span>Always allow this tool</span>
          </Label>
        </div>
      )}
    </div>
  );
}
