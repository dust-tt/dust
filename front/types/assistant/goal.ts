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
