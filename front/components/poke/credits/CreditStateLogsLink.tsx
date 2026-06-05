import { Icon, LinkExternal01, LinkWrapper } from "@dust-tt/sparkle";

type CreditStateMachine = "pool" | "programmatic" | "user";

// Must match the log messages emitted by the credit state machines in
// `lib/metronome/{workspace,programmatic,user}_credit_state_machine.ts`.
// Kept as literals here so this client component doesn't import the server-only
// state-machine modules.
const TRANSITION_LOG_MESSAGE: Record<CreditStateMachine, string> = {
  pool: "[WorkspaceCreditStateMachine]",
  programmatic: "[ProgrammaticCreditStateMachine]",
  user: "[UserCreditStateMachine]",
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Build a Datadog logs deep-link for a credit state machine's "Transition
// applied" logs, scoped to the workspace (and user, for the per-user machine).
export function buildCreditStateTransitionLogsUrl({
  machine,
  workspaceId,
  userId,
}: {
  machine: CreditStateMachine;
  workspaceId: string;
  userId?: string;
}): string {
  const queryParts = [
    `"${TRANSITION_LOG_MESSAGE[machine]}"`,
    `@workspaceId:${workspaceId}`,
  ];
  if (userId) {
    queryParts.push(`@userId:${userId}`);
  }
  const query = queryParts.join(" ");

  const nowMs = Date.now();
  const fromMs = nowMs - THIRTY_DAYS_MS;

  const params = new URLSearchParams({
    query,
    cols: "service,@timestamp_utc",
    messageDisplay: "inline",
    refresh_mode: "sliding",
    storage: "hot",
    stream_sort: "desc",
    viz: "stream",
    from_ts: String(fromMs),
    to_ts: String(nowMs),
    live: "true",
  });

  return `https://app.datadoghq.eu/logs?${params.toString()}`;
}

interface CreditStateLogsLinkProps {
  machine: CreditStateMachine;
  workspaceId: string;
  userId?: string;
  label?: string;
}

export function CreditStateLogsLink({
  machine,
  workspaceId,
  userId,
  label = "logs",
}: CreditStateLogsLinkProps) {
  return (
    <LinkWrapper
      href={buildCreditStateTransitionLogsUrl({ machine, workspaceId, userId })}
      target="_blank"
      className="inline-flex items-center gap-0.5 text-xs text-highlight-400"
    >
      <span>{label}</span>
      <Icon visual={LinkExternal01} size="xs" />
    </LinkWrapper>
  );
}
