import type { GoalType } from "@app/types/assistant/goal";
import { z } from "zod";

export const GoalBranchSchema = z.object({
  branchId: z.string().nullable().optional(),
});

export type GetConversationGoalResponseBody = {
  goal: GoalType | null;
};
