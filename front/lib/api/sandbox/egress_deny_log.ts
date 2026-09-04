import { readNewDenyLogEntries } from "@app/lib/api/sandbox/egress";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { SandboxFunctionCallError } from "@app/types/api/sandbox_functions";
import { z } from "zod";

// The egress proxy's domain-allowlist gate writes this reason. It is the only
// deny reason that means "this domain was blocked" and is actionable by the
// agent (ask an admin / add_egress_domain / declare it at publish).
const PROXY_ALLOWLIST_DENY_REASON = "proxy_denied";

const DenyLogLineSchema = z.object({
  reason: z.string(),
  domain: z.string().nullish(),
  port: z.number().nullish(),
});

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export type EgressDenyLogSummary = {
  // Allowlist denials rendered for the agent, plus unrecognized lines verbatim,
  // in log order.
  agentFacing: string[];
  // Domains the allowlist blocked, deduped, in first-seen order.
  blockedDomains: string[];
  // Request-rewrite harness denials: hidden from the agent, kept for logging.
  harnessDenials: { reason: string; domain: string | null }[];
};

// The sandbox deny log is written by two distinct layers into one file: the
// egress proxy's domain-allowlist gate (`proxy_denied`) and the in-sandbox
// request-rewrite harness (malformed headers, secret-to-host scoping, SNI
// checks, ...). Only the allowlist denials mean "this domain was blocked".
// Surfacing the harness reasons to the agent makes it misread auth/4xx
// failures on *allowed* domains as proxy blocks, so those are kept for the
// caller to log. Unrecognized lines are kept verbatim (fail open) so a real
// denial we don't understand is never silently swallowed.
export function partitionDenyLogEntries(
  rawLines: string[]
): EgressDenyLogSummary {
  const agentFacing: string[] = [];
  const blockedDomains = new Set<string>();
  const harnessDenials: { reason: string; domain: string | null }[] = [];

  for (const line of rawLines) {
    const parsed = DenyLogLineSchema.safeParse(safeJsonParse(line));
    if (!parsed.success) {
      agentFacing.push(line);
      continue;
    }

    const { reason, domain, port } = parsed.data;
    if (reason !== PROXY_ALLOWLIST_DENY_REASON) {
      harnessDenials.push({ reason, domain: domain ?? null });
      continue;
    }
    if (!domain) {
      agentFacing.push(line);
      continue;
    }

    blockedDomains.add(domain);
    agentFacing.push(
      `denied ${domain}${port ? `:${port}` : ""} (blocked by egress allowlist)`
    );
  }

  return {
    agentFacing,
    blockedDomains: [...blockedDomains],
    harnessDenials,
  };
}

// Best-effort: reads the sandbox's new deny-log lines and partitions them.
// Harness denials are logged here so every caller reports them the same way.
// Returns null when the log cannot be read; that is never worth failing the
// caller's own outcome over.
export async function collectEgressDenials(
  auth: Authenticator,
  sandbox: SandboxResource,
  logContext: Record<string, unknown>
): Promise<EgressDenyLogSummary | null> {
  const denyResult = await readNewDenyLogEntries(auth, sandbox);
  if (denyResult.isErr()) {
    logger.warn(
      { ...logContext, err: denyResult.error, providerId: sandbox.providerId },
      "Failed to read egress deny log"
    );
    return null;
  }

  const summary = partitionDenyLogEntries(denyResult.value);
  if (summary.harnessDenials.length > 0) {
    logger.info(
      {
        ...logContext,
        sandboxId: sandbox.sId,
        harnessDenials: summary.harnessDenials,
      },
      "Sandbox egress request policy denied requests"
    );
  }

  return summary;
}

// Appends the blocked domains and the way to get them allowed to a function's
// error, so the agent learns which domain to declare instead of seeing a bare
// network failure. Frames declare domains in the manifest; Pod Functions at
// publish.
export function withBlockedEgressHint(
  error: SandboxFunctionCallError,
  {
    blockedDomains,
    ownerKind,
  }: { blockedDomains: string[]; ownerKind: "frame" | "pod" }
): SandboxFunctionCallError {
  if (blockedDomains.length === 0) {
    return error;
  }
  const declareHint =
    ownerKind === "frame"
      ? 'add them to the manifest\'s "domains" and republish'
      : 'declare them in the publish tool\'s "domains"';
  return {
    ...error,
    message:
      `${error.message} Egress blocked for: ${blockedDomains.join(", ")}. ` +
      `To allow them, ${declareHint}, or call request_egress_domain.`,
  };
}
