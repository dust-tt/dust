import { z } from "zod";

export const GOAL_STATUSES = [
  "active",
  "paused",
  "blocked",
  "completed",
  "cancelled",
] as const;

export const GoalStatusSchema = z.enum(GOAL_STATUSES);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const GoalCreationSchema = z.object({
  objective: z.string().trim().min(1).max(4_000),
});
export type GoalCreation = z.infer<typeof GoalCreationSchema>;

/**
 * @swaggerschema PrivateGoal (swagger_private_schemas.ts)
 */
export type GoalType = {
  sId: string;
  objective: string;
  status: GoalStatus;
  agentConfigurationId: string;
  branchId: string | null;
  turnCount: number;
  maxTurns: number;
  reason: string | null;
  createdAt: number;
  updatedAt: number;
  terminalAt: number | null;
};

export const GoalSchema: z.ZodType<GoalType> = z.object({
  sId: z.string(),
  objective: z.string(),
  status: GoalStatusSchema,
  agentConfigurationId: z.string(),
  branchId: z.string().nullable(),
  turnCount: z.number(),
  maxTurns: z.number(),
  reason: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  terminalAt: z.number().nullable(),
});
