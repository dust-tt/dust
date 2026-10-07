import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Globe01 } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
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

  let actionName: string;
  if (domain) {
    actionName = isRunning
      ? t`Requesting access to ${domain}`
      : t`Request access to ${domain}`;
  } else {
    actionName = isRunning
      ? t`Requesting access to domain`
      : t`Request access to domain`;
  }

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      visual={Globe01}
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

function statusLabel(
  t: (descriptor: MessageDescriptor) => string,
  status: EgressStatus,
  isRunning: boolean
): string {
  if (isRunning) {
    return t(msg`Pending user approval…`);
  }
  switch (status) {
    case "added":
      return t(msg`Added to Computer allowlist`);
    case "already_allowed":
      return t(msg`Already allowed`);
    case "unknown":
      return t(msg`Not added`);
    default:
      assertNeverAndIgnore(status);
      return t(msg`Not added`);
  }
}

function ConversationView({
  domain,
  reason,
  status,
  isRunning,
}: EgressViewProps) {
  const { t } = useLingui();
  return (
    <div className="flex flex-col gap-1 pl-6 text-sm">
      {domain && (
        <div>
          <span className="text-muted-foreground">
            <Trans>Domain:</Trans>{" "}
          </span>
          <span className="font-mono">{domain}</span>
        </div>
      )}
      {reason && (
        <div>
          <span className="text-muted-foreground">
            <Trans>Reason:</Trans>{" "}
          </span>
          <span>{reason}</span>
        </div>
      )}
      <div>
        <span className="text-muted-foreground">
          <Trans>Status:</Trans>{" "}
        </span>
        <span>{statusLabel(t, status, isRunning)}</span>
      </div>
    </div>
  );
}

function SidebarView({ domain, reason, status, isRunning }: EgressViewProps) {
  const { t } = useLingui();
  return (
    <div className="flex flex-col gap-4 py-4 pl-6 text-sm">
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground">
          <Trans>Domain</Trans>
        </span>
        <span className="font-mono">{domain ?? "—"}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground">
          <Trans>Reason</Trans>
        </span>
        <span>{reason ?? "—"}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground">
          <Trans>Status</Trans>
        </span>
        <span>{statusLabel(t, status, isRunning)}</span>
      </div>
    </div>
  );
}
