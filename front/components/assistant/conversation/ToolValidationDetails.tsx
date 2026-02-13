import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { CREATE_REFERRAL_TOOL_NAME } from "@app/lib/api/actions/servers/ashby/metadata";
import { isAshbyCreateReferralInput } from "@app/lib/api/actions/servers/ashby/types";
import type { UserType } from "@app/types/user";

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
  user: UserType;
}

export function ToolValidationDetails({
  blockedAction,
  user,
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

  // Custom component for Ashby referral creation.
  if (
    blockedAction.metadata.mcpServerName === "ashby" &&
    blockedAction.metadata.toolName === CREATE_REFERRAL_TOOL_NAME &&
    isAshbyCreateReferralInput(blockedAction.inputs)
  ) {
    return (
      <AshbyReferralDetails
        fieldSubmissions={blockedAction.inputs.fieldSubmissions}
        userEmail={user?.email ?? null}
      />
    );
  }

  if (displayableInputs.length === 0) {
    return null;
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

function formatFieldValue(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

interface AshbyReferralDetailsProps {
  fieldSubmissions: ReadonlyArray<{
    title: string;
    value: string | number | boolean;
  }>;
  userEmail: string | null;
}

function AshbyReferralDetails({
  fieldSubmissions,
  userEmail,
}: AshbyReferralDetailsProps) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      {userEmail && (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {/* Safe to show: this component only renders for the user who
            triggered the action (isTriggeredByCurrentUser guard in parent). */}
          <>
            The referral will be credited to&nbsp;
            <span className="font-medium text-foreground dark:text-foreground-night">
              {userEmail}
            </span>
            .
          </>
        </p>
      )}

      <div className="divide-y divide-separator overflow-hidden rounded-xl bg-background dark:divide-separator-night dark:bg-background-night">
        {fieldSubmissions.map((field, index) => {
          const displayValue = formatFieldValue(field.value);

          if (!displayValue) {
            return null;
          }

          return (
            <div key={index} className="px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                {field.title}
              </div>
              <div className="mt-0.5 text-sm text-foreground dark:text-foreground-night">
                {displayValue}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
