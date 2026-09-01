import { config as regionConfig } from "@app/lib/api/regions/config";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { statsDMetrics } from "@app/lib/utils/statsd";
import tracer from "@app/logger/tracer";

// Intentionally NOT tagged by workspace_id: region (+ operation/status) is
// what matters for aggregates, and workspace_id multiplies cardinality past
// Datadog custom-metric limits. Per-workspace drill-down stays in APM traces.
function regionTag(): string {
  return `region:${regionConfig.getCurrentRegion()}`;
}

// Semantic phases of the "zero to first executed command" startup path, in
// roughly the order they run on a fresh sandbox. These exist purely to LABEL
// and GROUP the per-command spans that traceSandboxOperation already emits
// (trace.sandbox.provider.exec / .writeFile / .create / .wake): without a
// parent span every setup command is an undifferentiated `provider.exec`.
// The few entries that never become a sandbox command (resolve_proxy DNS,
// gcs.mint_token GCP token mint) are the real timing blindspots a parent span
// alone would not cover.
//
// Naming: coarse phases are snake_case (`provider_ensure`, `gcs_mount`);
// sub-steps are `<area>.step` (`gcs.gcsfuse_mount`) so they group by prefix.
type SandboxStartupPhase =
  // Coarse phases (one per sandbox readiness step).
  | "total"
  | "provider_ensure"
  | "egress_prep"
  | "gcs_mount"
  | "gcs_refresh"
  | "filesystem.database_mount"
  | "egress_on_exec"
  | "telemetry_start"
  // provider.create split.
  | "provider.create_vm"
  | "provider.hardening"
  // Egress forwarder bring-up sub-steps. The token/secrets/manifest writes run
  // sequentially, each gated on the previous, so their spans are back-to-back
  // under egress_prep.
  | "egress.resolve_proxy"
  | "egress.write_token"
  | "egress.write_secrets"
  | "egress.write_manifest"
  | "egress.kill_existing"
  | "egress.start_forwarder"
  | "egress.wait_healthy"
  | "egress.healthcheck"
  | "egress.install_trust_bundle"
  // GCS token minting, broker startup, and individual gcsfuse mount commands.
  | "gcs.mint_token"
  | "gcs.token_server"
  | "gcs.gcsfuse_mount"
  // Pod state bring-up (cold start only, after gcs_mount): restore replicated
  // SQLite databases, then start the daemon (its static directory-watcher
  // config is baked in the image).
  | "pod_state_setup"
  | "pod_state.enumerate"
  | "pod_state.restore_db"
  | "pod_state.start_daemon";

// Opens a parent APM span for a startup phase. The provider.* child spans nest
// underneath automatically, so this adds semantic grouping (and a per-phase
// trace.sandbox.startup.<phase> metric with p50/p95/p99) WITHOUT duplicating
// the per-command timing that already exists. No statsd here on purpose: phase
// percentiles come for free from the trace metric.
export function traceSandboxStartupPhase<T>(
  phase: SandboxStartupPhase,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  return tracer.trace("sandbox.startup", { resource: phase }, async (span) => {
    span?.setTag("phase", phase);
    if (tags) {
      Object.entries(tags).forEach(([key, value]) => span?.setTag(key, value));
    }
    return fn();
  });
}

// Headline "0 -> first command" wall time for one sandbox readiness run,
// split cold (fresh create) vs warm (wake/reuse). Not covered by
// sandbox.tools.duration, which starts only once setup is done.
export function recordSandboxStartupTotal(
  durationMs: number,
  { region, cold }: { region?: string; cold: boolean },
  status: "success" | "error"
): void {
  statsDMetrics.distribution("sandbox.startup.total.duration", durationMs, [
    `region:${region ?? regionConfig.getCurrentRegion()}`,
    `cold:${cold}`,
    `status:${status}`,
  ]);
}

export function recordLifecycleOperation(
  operation: "create" | "wake" | "sleep" | "destroy"
): void {
  statsDMetrics.increment(`sandbox.lifecycle.${operation}`, 1, [regionTag()]);
}

/**
 * One sandbox function run, tagged by owner and by which runner served it
 * (resident warm server vs cold spawn). The warm share is the number the
 * warm-runner rollout turns on; duration is the exec's wall time as front saw it.
 */
export function recordSandboxFunctionRun({
  ownerKind,
  runnerKind,
  status,
  durationMs,
}: {
  ownerKind: "frame" | "pod";
  runnerKind: "warm" | "cold" | "unknown";
  status: "success" | "error";
  durationMs: number;
}): void {
  const tags = [
    regionTag(),
    `owner_kind:${ownerKind}`,
    `runner_kind:${runnerKind}`,
    `status:${status}`,
  ];
  statsDMetrics.increment("sandbox.functions.run", 1, tags);
  statsDMetrics.distribution(
    "sandbox.functions.run.duration",
    durationMs,
    tags
  );
}

export function recordStateDuration(
  previousStatus: SandboxStatus,
  durationMs: number
): void {
  statsDMetrics.distribution("sandbox.lifecycle.duration", durationMs, [
    regionTag(),
    `status:${previousStatus}`,
  ]);
}

export function recordToolDuration(
  tool: string,
  durationMs: number,
  status: "success" | "error" = "success"
): void {
  statsDMetrics.distribution("sandbox.tools.duration", durationMs, [
    `tool:${tool}`,
    `status:${status}`,
  ]);
}

// Health of the sandbox-state pre-sleep flush. Keep the existing metric name while deployed
// monitors migrate independently.
// monitors page on the failure count; the stable logger.error message next to
// each failing call site carries the cause.
export function recordSandboxStateHealth(status: "success" | "failure"): void {
  statsDMetrics.increment("sandbox.pod_state.health", 1, [
    regionTag(),
    `status:${status}`,
  ]);
}

export const recordPodStateHealth = recordSandboxStateHealth;
