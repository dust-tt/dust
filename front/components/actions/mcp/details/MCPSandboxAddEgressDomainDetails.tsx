import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { GlobeAltIcon } from "@dust-tt/sparkle";
import { useMemo } from "react";

type EgressStatus = "added" | "already_allowed" | "unknown";

function parseStatus(rawText: string | null): EgressStatus {
  if (!rawText) {
    return "unknown";
  }
  if (/^Allowed:/m.test(rawText)) {
    return "added";
  }
  if (/^Already allowed:/m.test(rawText)) {
    return "already_allowed";
  }
  return "unknown";
}

export function MCPSandboxAddEgressDomainDetails({
  displayContext,
  toolParams,
  toolOutput,
}: ToolExecutionDetailsProps) {
  const domain =
    typeof toolParams.domain === "string" ? toolParams.domain : null;
  const reason =
    typeof toolParams.reason === "string" ? toolParams.reason : null;

  const rawOutputText = useMemo(() => {
    if (!toolOutput) {
      return null;
    }
    const textBlocks = toolOutput.filter(isTextContent);
    return textBlocks.map((b) => b.text).join("\n") || null;
  }, [toolOutput]);

  const isRunning = toolOutput === null;
  const status = useMemo(() => parseStatus(rawOutputText), [rawOutputText]);

  const actionName = isRunning
    ? domain
      ? `Requesting access to ${domain}`
      : "Requesting sandbox network access"
    : domain
      ? `Request access to ${domain}`
      : "Allow domain in sandbox";

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      visual={GlobeAltIcon}
    >
      {displayContext === "conversation" ? (
        <ConversationView
          domain={domain}
          reason={reason}
          status={status}
          isRunning={isRunning}
        />
      ) : (
        <SidebarView
          domain={domain}
          reason={reason}
          status={status}
          isRunning={isRunning}
        />
      )}
    </ActionDetailsWrapper>
  );
}

interface EgressViewProps {
  domain: string | null;
  reason: string | null;
  status: EgressStatus;
  isRunning: boolean;
}

function statusLabel(status: EgressStatus, isRunning: boolean): string {
  if (isRunning) {
    return "Pending user approval…";
  }
  switch (status) {
    case "added":
      return "Added to sandbox allowlist";
    case "already_allowed":
      return "Already allowed";
    case "unknown":
      return "Not added";
    default:
      assertNeverAndIgnore(status);
      return "Not added";
  }
}

function ConversationView({
  domain,
  reason,
  status,
  isRunning,
}: EgressViewProps) {
  return (
    <div className="flex flex-col gap-1 pl-6 text-sm">
      {domain && (
        <div>
          <span className="text-muted-foreground dark:text-muted-foreground-night">
            Domain:{" "}
          </span>
          <span className="font-mono">{domain}</span>
        </div>
      )}
      {reason && (
        <div>
          <span className="text-muted-foreground dark:text-muted-foreground-night">
            Reason:{" "}
          </span>
          <span>{reason}</span>
        </div>
      )}
      <div>
        <span className="text-muted-foreground dark:text-muted-foreground-night">
          Status:{" "}
        </span>
        <span>{statusLabel(status, isRunning)}</span>
      </div>
    </div>
  );
}

function SidebarView({ domain, reason, status, isRunning }: EgressViewProps) {
  return (
    <div className="flex flex-col gap-4 py-4 pl-6 text-sm">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground dark:text-foreground-night">
          Domain
        </span>
        <span className="font-mono">{domain ?? "—"}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground dark:text-foreground-night">
          Reason
        </span>
        <span>{reason ?? "—"}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground dark:text-foreground-night">
          Status
        </span>
        <span>{statusLabel(status, isRunning)}</span>
      </div>
    </div>
  );
}
