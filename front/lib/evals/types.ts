import { caseCount } from "@app/lib/evals/planning";
import { ModelSelectionSchema } from "@app/types/assistant/models/types";
import { z } from "zod";

const VariantSchema = z.object({
  agentId: z.string().min(1).max(255),
  modelSelection: ModelSelectionSchema.optional(),
}).strict();

// Bound fan-out, input payloads, and history size for the internal pilot.
export const EvalConfigSchema = z.object({
  rows: z.array(z.object({
    prompt: z.string().min(1).max(10000),
    judgePrompt: z.string().min(1).max(10000),
  }).strict()).min(1).max(100),
  variants: z.array(VariantSchema).min(1).max(10),
  judge: VariantSchema,
  repetitions: z.number().int().min(1).max(10).default(1),
  judgeRuns: z.number().int().min(1).max(5).default(1),
  concurrency: z.number().int().min(1).max(5).default(2),
  timeoutSeconds: z.number().int().min(30).max(1200).default(600),
  scale: z.enum(["binary", "0-3", "1-5", "0-100"]).default("0-3"),
  globalJudgePrompt: z.string().max(10000).default(""),
}).strict().superRefine((config, ctx) => {
  if (caseCount(config) > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Maximum 100 cases per run." });
  }
  if (JSON.stringify(config).length > 250000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Config is too large." });
  }
});

export type EvalConfig = z.infer<typeof EvalConfigSchema>;
export type EvalVariant = EvalConfig["judge"];
export type RunStatus = "queued" | "running" | "completed" | "completed_with_errors" | "cancelled" | "failed";
export type StepStatus = "pending" | "launching" | "running" | "completed" | "failed" | "cancelled";
export type StepKey = { runId: string; caseIndex: number; voteIndex: number };
// voteIndex=-1 denotes the evaluated agent; 0..judgeRuns-1 denote judge votes.
export type StepOutput = {
  response: string;
  durationMs: number;
  score: number | null;
  ownCostCredits: number | null;
  resolvedModel: unknown;
};
export type CaseCoordinates = { rowIndex: number; variantIndex: number; repetition: number };

export { caseCount, caseCoordinates } from "@app/lib/evals/planning";
