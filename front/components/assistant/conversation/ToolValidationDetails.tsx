import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";

import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { CREATE_REFERRAL_TOOL_NAME } from "@app/lib/api/actions/servers/ashby/metadata";
import { isAshbyCreateReferralInput } from "@app/lib/api/actions/servers/ashby/types";
import { useMemo } from "react";

const MAX_DISPLAY_VALUE_LENGTH = 300;

function humanizeFieldName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function formatDisplayValue(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "object") {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  const str = String(value);
  if (!str) {
    return null;
  }
  if (str.length <= MAX_DISPLAY_VALUE_LENGTH) {
    return str;
  }
  return `${str.slice(0, MAX_DISPLAY_VALUE_LENGTH)}…`;
}

interface DisplayableInput {
  label: string;
  value: string;
}

interface ToolValidationDetailsProps {
  blockedAction: BlockedToolExecution;
  userEmail: string | null;
}

export function ToolValidationDetails({
  blockedAction,
  userEmail,
}: ToolValidationDetailsProps) {
  const displayableInputs: DisplayableInput[] = useMemo(() => {
    if (!blockedAction.inputs) {
      return [];
    }
    return Object.entries(blockedAction.inputs)
      .map(([key, value]) => ({
        label: humanizeFieldName(key),
        value: formatDisplayValue(value),
      }))
      .filter((entry): entry is DisplayableInput => entry.value !== null);
  }, [blockedAction.inputs]);

  if (displayableInputs.length > 0) {
    return null;
  }

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
          {/* This component only renders for the user who triggered the action, the current user's email is
           necessarily that of the user who triggered the action. */}
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
                <div key={index} className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                    {field.title}:
                  </span>
                  <span className="whitespace-pre-wrap break-words">
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
  return (
    <Collapsible>
      <CollapsibleTrigger>
        <span className="my-2 font-medium">Details</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-80 space-y-2 overflow-auto rounded-lg bg-muted p-3 text-sm dark:bg-muted-night">
          {displayableInputs.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                {label}
              </span>
              <span className="whitespace-pre-wrap break-words">{value}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
