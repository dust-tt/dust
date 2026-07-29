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
