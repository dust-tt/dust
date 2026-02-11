import { AshbyLogo, cn } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import {
  getOutputText,
  isTextContent,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isAshbyCreateReferralInput } from "@app/lib/api/actions/servers/ashby/types";
import { useUser } from "@app/lib/swr/user";

export function MCPAshbyReferralActionDetails({
  displayContext,
  toolParams,
  toolOutput,
}: ToolExecutionDetailsProps) {
  const { user } = useUser();

  const input = isAshbyCreateReferralInput(toolParams)
    ? toolParams
    : null;

  const outputText = toolOutput
    ?.filter(isTextContent)
    .map(getOutputText)
    .join("\n") ?? null;

  const isSuccess = outputText?.startsWith("Successfully created referral") ?? false;

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={
        displayContext === "conversation"
          ? "Creating referral on Ashby"
          : "Create referral on Ashby"
      }
      visual={AshbyLogo}
    >
      <div
        className={cn(
          "flex flex-col gap-3",
          displayContext === "conversation" ? "pl-6" : "pt-2"
        )}
      >
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          This will submit a referral on Ashby.
          {user?.email && (
            <>
              &nbsp;The referral will be credited to&nbsp;
              <span className="font-medium text-foreground dark:text-foreground-night">
                {user.email}
              </span>
              .
            </>
          )}
        </p>

        {input && (
          <div className="flex flex-col gap-1">
            {input.fieldSubmissions.map((field, index) => (
              <div
                key={index}
                className="flex flex-row gap-2 text-sm"
              >
                <span className="font-medium text-foreground dark:text-foreground-night">
                  {field.title}:
                </span>
                <span className="text-muted-foreground dark:text-muted-foreground-night">
                  {String(field.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {outputText && displayContext !== "conversation" && (
          <p
            className={cn(
              "text-sm",
              isSuccess
                ? "text-success dark:text-success-night"
                : "text-warning dark:text-warning-night"
            )}
          >
            {outputText}
          </p>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
