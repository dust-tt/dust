import { statsDMetrics } from "@app/lib/utils/statsd";
import { DfsError } from "@app/types/dfs";
import type { CanaryCheck } from "@app/workers/gcs_dfs/canary";
import { OwnershipError } from "@app/workers/gcs_dfs/coordination";
import { GcsDfsError } from "@app/workers/gcs_dfs/protocol";
import type { TransportConfig } from "@app/workers/gcs_dfs/protocol";
import { z } from "zod";

export type Operation =
  | "receive"
  | "pull"
  | "lease"
  | "acknowledge"
  | "relay_publish"
  | "message"
  | "source_metadata"
  | "source_content"
  | "dfs_cursor"
  | "dfs_stage"
  | "dfs_publish"
  | "cas_retry"
  | "create"
  | "update"
  | "delete"
  | CanaryCheck["operation"];
export type Outcome = "success" | "error" | "applied" | "stale";
export type Observation = {
  operation: Operation;
  outcome: Outcome;
  durationMs?: number;
  bytes?: number;
  errorClass?: string;
  hop?: "relay" | "importer";
};
export type Observer = (observation: Observation) => void;
export const ignoreObservation: Observer = () => {};

export function errorClass(error: unknown): string {
  if (error instanceof DfsError) {
    return `dfs_${error.code}`;
  }
  if (error instanceof OwnershipError) {
    return error.reason;
  }
  if (error instanceof GcsDfsError) {
    return error.reason;
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return "invalid_input";
  }
  return "transport_or_runtime";
}

export function metricsObserver(
  config: Pick<TransportConfig, "environment" | "cell">,
  component: "relay" | "importer" | "producer" | "checker"
): Observer {
  const baseTags = [
    `environment:${config.environment}`,
    `cell:${config.cell}`,
    `component:${component}`,
  ];
  return (event) => {
    const tags = [
      ...baseTags,
      `operation:${event.operation}`,
      `outcome:${event.outcome}`,
      `error_class:${event.errorClass ?? "none"}`,
      ...(event.hop ? [`hop:${event.hop}`] : []),
    ];
    statsDMetrics.increment("gcs_dfs.operations", 1, tags);
    if (event.durationMs !== undefined) {
      statsDMetrics.distribution("gcs_dfs.duration_ms", event.durationMs, tags);
    }
    if (event.bytes !== undefined) {
      statsDMetrics.increment("gcs_dfs.bytes", event.bytes, tags);
    }
  };
}
