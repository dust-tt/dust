import type pino from "pino";

export type CheckFunction = (
  checkName: string,
  logger: pino.Logger,
  reportSuccess: (reportPayload: unknown) => void,
  reportFailure: (reportPayload: unknown, message: string) => void,
  heartbeat: () => void
) => Promise<void>;

export type Check = {
  name: string;
  check: CheckFunction;
  everyHour: number;
};

// Heartbeat types for Temporal activity
export type CheckHeartbeatType =
  | "start"
  | "processing"
  | "skip"
  | "finish"
  | "success"
  | "failure";

export interface CheckHeartbeat {
  type: CheckHeartbeatType;
  name: string;
  uuid: string;
}

// Action links for check results
export interface ActionLink {
  label: string;
  url: string;
}

// Result types for API responses
export type CheckResultStatus = "success" | "failure" | "skipped" | "running";

export interface CheckResult {
  checkName: string;
  status: CheckResultStatus;
  timestamp: string;
  payload: unknown;
  errorMessage: string | null;
  actionLinks: ActionLink[];
}

export interface ProductionCheckWorkflowRun {
  workflowId: string;
  runId: string;
  startTime: string;
  closeTime: string | null;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "TERMINATED" | "TIMED_OUT";
  checks: CheckResult[];
}

export interface RegisteredCheckMeta {
  name: string;
  everyHour: number;
}

// New types for redesigned production checks page
export type CheckSummaryStatus = "ok" | "alert" | "no-data";

export interface CheckSummary {
  name: string;
  everyHour: number;
  status: CheckSummaryStatus;
  lastRun: {
    timestamp: string;
    errorMessage: string | null;
    payload: unknown;
    actionLinks: ActionLink[];
  } | null;
}

export interface CheckHistoryRun {
  workflowId: string;
  runId: string;
  timestamp: string;
  status: CheckResultStatus;
  errorMessage: string | null;
  payload: unknown;
  actionLinks: ActionLink[];
  workflowType: "manual" | "scheduled";
}

// Type for activity return values (stored in workflow history)
export type CheckActivityResultStatus = "success" | "failure" | "skipped";

export interface CheckActivityResult {
  checkName: string;
  status: CheckActivityResultStatus;
  timestamp: string;
  payload: unknown;
  errorMessage: string | null;
  actionLinks: ActionLink[];
}
