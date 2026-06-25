import type { TriggerType } from "@app/types/assistant/triggers";
import {
  FullTriggerSchema,
  TriggerSchema,
} from "@app/types/assistant/triggers";
import { z } from "zod";

export interface GetUserTriggersResponseBody {
  triggers: (TriggerType & {
    isEditor: boolean;
    agentName: string;
    agentPictureUrl: string;
  })[];
}

export const GetTriggersResponseBodySchema = z.object({
  triggers: z.array(
    FullTriggerSchema.and(
      z.object({
        isEditor: z.boolean(),
        editorName: z.string().optional(),
      })
    )
  ),
});
export type GetTriggersResponseBody = z.infer<
  typeof GetTriggersResponseBodySchema
>;

export const DeleteTriggersRequestBodySchema = z.object({
  triggerIds: z.array(z.string()),
});
export type DeleteTriggersRequestBody = z.infer<
  typeof DeleteTriggersRequestBodySchema
>;

export const PatchTriggersRequestBodySchema = z.object({
  triggers: z.array(z.object({ sId: z.string() }).and(TriggerSchema)),
});
export type PatchTriggersRequestBody = z.infer<
  typeof PatchTriggersRequestBodySchema
>;

export const PostTriggersRequestBodySchema = z.object({
  triggers: z.array(TriggerSchema),
});
export type PostTriggersRequestBody = z.infer<
  typeof PostTriggersRequestBodySchema
>;

// Backward-compatible: cron responses include cronRule, interval responses
// include interval fields.
export type PostTextAsCronRuleResponseBody =
  | { type?: "cron"; cronRule: string; timezone: string }
  | {
      type: "interval";
      intervalDays: number;
      dayOfWeek: number | null;
      hour: number;
      minute: number;
      timezone: string;
    };

export const PostTextAsCronRuleRequestBodySchema = z.object({
  naturalDescription: z.string(),
  defaultTimezone: z.string(),
});
export type PostTextAsCronRuleRequestBody = z.infer<
  typeof PostTextAsCronRuleRequestBodySchema
>;
