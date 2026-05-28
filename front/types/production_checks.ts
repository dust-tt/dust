import type pino from "pino";
import { z } from "zod";

// Action links for check results
export interface ActionLink {
  label: string;
  url: string;
}

// Payload types for check functions
export interface CheckFailurePayload {
  actionLinks: ActionLink[];
  errorMessage?: string;
  [key: string]: unknown;
}

export type CheckSuccessPayload = Record<string, unknown>;

export type CheckFunction = (
  checkName: string,
  logger: pino.Logger,
  reportSuccess: (payload?: CheckSuccessPayload) => void,
  reportFailure: (payload: CheckFailurePayload, message: string) => void,
  heartbeat: () => void,
) => Promise<void>;

export type Check = {
  name: string;
  check: CheckFunction;
  everyHour: number;
};

export const CheckHeartbeatDetailsSchema = z.object({
  type: z.enum(["start", "processing", "skip", "success", "failure"]),
  name: z.string(),
  uuid: z.string(),
  completedCheckNames: z.array(z.string()),
});

export type CheckHeartbeatDetails = z.infer<typeof CheckHeartbeatDetailsSchema>;

export type CheckHeartbeat = Omit<CheckHeartbeatDetails, "completedCheckNames">;

// Result types for API responses
export type CheckResultStatus = "success" | "failure" | "skipped" | "running";

export interface CheckResult {
  checkName: string;
  status: CheckResultStatus;
  timestamp: string;
  payload:
    | CheckSuccessPayload
    | CheckFailurePayload
    | CheckFailurePayload[]
    | null;
  errorMessage: string | null;
  actionLinks: ActionLink[];
}

export type CheckActivityResultStatus = "success" | "failure" | "skipped";

export interface CheckActivityResult {
  checkName: string;
  status: CheckActivityResultStatus;
  timestamp: string;
  payload:
    | CheckSuccessPayload
    | CheckFailurePayload
    | CheckFailurePayload[]
    | null;
  errorMessage: string | null;
  actionLinks: ActionLink[];
}

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
