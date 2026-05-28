import type pino from "pino";
import { z } from "zod";

// Action links for check results
const ActionLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

export type ActionLink = z.infer<typeof ActionLinkSchema>;

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

const CheckActivityResultStatusSchema = z.enum([
  "success",
  "failure",
  "skipped",
]);

export const CheckActivityResultSchema = z.object({
  checkName: z.string(),
  status: CheckActivityResultStatusSchema,
  timestamp: z.string(),
  payload: z
    .union([z.record(z.unknown()), z.array(z.record(z.unknown()))])
    .nullable(),
  errorMessage: z.string().nullable(),
  actionLinks: z.array(ActionLinkSchema),
});

export const CheckHeartbeatDetailsSchema = z.object({
  type: z.enum(["start", "processing", "skip", "success", "failure"]),
  name: z.string(),
  uuid: z.string(),
  results: z.array(CheckActivityResultSchema),
});

export type CheckHeartbeatDetails = z.infer<typeof CheckHeartbeatDetailsSchema>;

export type CheckHeartbeat = Omit<CheckHeartbeatDetails, "results">;

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

export type CheckActivityResult = z.infer<typeof CheckActivityResultSchema>;

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
