import {
  CodeBlockWithExtendedSupport,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";

import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { CREATE_REFERRAL_TOOL_NAME } from "@app/lib/api/actions/servers/ashby/metadata";
import { isAshbyCreateReferralInput } from "@app/lib/api/actions/servers/ashby/types";

interface ToolValidationDetailsProps {
  blockedAction: BlockedToolExecution;
  hasDetails: boolean;
  userEmail: string | null;
}

export function ToolValidationDetails({
  blockedAction,
  hasDetails,
  userEmail,
}: ToolValidationDetailsProps) {
  // Show a custom component for Ashby referral creation.
  if (
    blockedAction.metadata.mcpServerName === "ashby" &&
    blockedAction.metadata.toolName === CREATE_REFERRAL_TOOL_NAME &&
    isAshbyCreateReferralInput(blockedAction.inputs)
  ) {
    const { fieldSubmissions } = blockedAction.inputs;

    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          This will submit a referral on Ashby.
          {/* Safe to show: this component only renders for the user who
              triggered the action (isTriggeredByCurrentUser guard in parent). */}
          {userEmail && (
            <>
              &nbsp;The referral will be credited to&nbsp;
              <span className="font-medium text-foreground dark:text-foreground-night">
                {userEmail}
              </span>
              .
            </>
          )}
        </p>
        <Collapsible>
          <CollapsibleTrigger>
            <span className="my-2 font-medium">Field values</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-1">
              {fieldSubmissions.map((field, index) => (
                <div key={index} className="flex flex-row gap-2 text-sm">
                  <span className="font-medium text-foreground dark:text-foreground-night">
                    {field.title}:
                  </span>
                  <span className="text-muted-foreground dark:text-muted-foreground-night">
                    {field.value}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  if (!hasDetails) {
    return null;
  }

  return (
    <Collapsible>
      <CollapsibleTrigger>
        <span className="my-2 font-medium">Details</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-80 overflow-auto bg-muted dark:bg-muted-night">
          <CodeBlockWithExtendedSupport className="language-json">
            {JSON.stringify(blockedAction.inputs, null, 2)}
          </CodeBlockWithExtendedSupport>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
