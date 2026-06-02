import { config as regionConfig } from "@app/lib/api/regions/config";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { getStatsDClient } from "@app/lib/utils/statsd";
import tracer from "@app/logger/tracer";

interface MetricContext {
  workspaceId: string;
  region?: string;
}

function buildTags(ctx: MetricContext): string[] {
  return [
    `workspace_id:${ctx.workspaceId}`,
    `region:${ctx.region ?? regionConfig.getCurrentRegion()}`,
  ];
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
export type SandboxStartupPhase =
  // Coarse phases (one per ensureSandboxReady step).
  | "total"
  | "provider_ensure"
  | "egress_prep"
  | "gcs_mount"
  | "gcs_refresh"
  | "egress_on_exec"
  | "telemetry_start"
  // provider.create split.
  | "provider.create_vm"
  | "provider.hardening"
  // Egress forwarder bring-up sub-steps. The token/secrets/manifest writes run
  // concurrently (independent files), so their spans overlap under egress_prep.
  | "egress.resolve_proxy"
  | "egress.write_token"
  | "egress.write_secrets"
  | "egress.write_manifest"
  | "egress.kill_existing"
  | "egress.start_forwarder"
  | "egress.wait_healthy"
  | "egress.healthcheck"
  | "egress.install_trust_bundle"
  // GCS FUSE mount sub-steps. token_server brackets the single exec that writes
  // the token, starts the token server, and polls it ready (was three execs).
  | "gcs.mint_token"
  | "gcs.token_server"
  | "gcs.gcsfuse_mount";

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

// The single net-new aggregate metric: the headline "0 -> first command" wall
// time for one ensureSandboxReady, split cold (fresh create path) vs warm
// (wake/reuse). This is NOT covered by sandbox.tools.duration, whose timer
// starts only once setup is already done and times the user command alone.
//
// Intentionally NOT tagged by workspace_id: the cold/warm split per region is
// what matters for latency, and workspace_id would multiply cardinality on a
// per-ensureSandboxReady distribution. Per-workspace drill-down stays available
// via APM traces.
export function recordSandboxStartupTotal(
  durationMs: number,
  { region, cold }: { region?: string; cold: boolean },
  status: "success" | "error"
): void {
  getStatsDClient().distribution("sandbox.startup.total.duration", durationMs, [
    `region:${region ?? regionConfig.getCurrentRegion()}`,
    `cold:${cold}`,
    `status:${status}`,
  ]);
}

export function recordLifecycleOperation(
  operation: "create" | "wake" | "sleep" | "destroy",
  ctx: MetricContext
): void {
  getStatsDClient().increment(
    `sandbox.lifecycle.${operation}`,
    1,
    buildTags(ctx)
  );
}

export function recordStateDuration(
  previousStatus: SandboxStatus,
  durationMs: number,
  ctx: MetricContext
): void {
  getStatsDClient().distribution("sandbox.lifecycle.duration", durationMs, [
    ...buildTags(ctx),
    `status:${previousStatus}`,
  ]);
}

export function recordToolDuration(
  tool: string,
  durationMs: number,
  ctx: MetricContext,
  status: "success" | "error" = "success"
): void {
  getStatsDClient().distribution("sandbox.tools.duration", durationMs, [
    ...buildTags(ctx),
    `tool:${tool}`,
    `status:${status}`,
  ]);
}
