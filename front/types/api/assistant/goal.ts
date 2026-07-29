import { GoalSchema, GoalUserActionSchema } from "@app/types/assistant/goal";
import { z } from "zod";

export const GoalBranchSchema = z.object({
  branchId: z.string().nullable().optional(),
});

export const GetConversationGoalResponseBodySchema = z.object({
  goal: GoalSchema.nullable(),
  canManage: z.boolean(),
});
export type GetConversationGoalResponseBody = z.infer<
  typeof GetConversationGoalResponseBodySchema
>;

export const PatchConversationGoalRequestBodySchema = GoalBranchSchema.extend({
  action: GoalUserActionSchema,
});

export const PatchConversationGoalResponseBodySchema = z.object({
  goal: GoalSchema,
  canManage: z.boolean(),
});
export type PatchConversationGoalResponseBody = z.infer<
  typeof PatchConversationGoalResponseBodySchema
>;
