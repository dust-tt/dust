import { z } from "zod";

export const WAKEUP_STATUSES = [
  "scheduled",
  "fired",
  "cancelled",
  "expired",
] as const;

export const WakeUpStatusSchema = z.enum(WAKEUP_STATUSES);
export type WakeUpStatus = z.infer<typeof WakeUpStatusSchema>;

export const WakeUpOneShotScheduleConfigSchema = z.object({
  type: z.literal("one_shot"),
  fireAt: z.number(),
});
export type WakeUpOneShotScheduleConfig = z.infer<
  typeof WakeUpOneShotScheduleConfigSchema
>;

export const WakeUpCronScheduleConfigSchema = z.object({
  type: z.literal("cron"),
  cron: z.string(),
  timezone: z.string(),
});
export type WakeUpCronScheduleConfig = z.infer<
  typeof WakeUpCronScheduleConfigSchema
>;

export const WakeUpScheduleConfigSchema = z.discriminatedUnion("type", [
  WakeUpOneShotScheduleConfigSchema,
  WakeUpCronScheduleConfigSchema,
]);
export type WakeUpScheduleConfig = z.infer<typeof WakeUpScheduleConfigSchema>;
export type WakeUpScheduleType = WakeUpScheduleConfig["type"];

export const WakeUpSchema = z.object({
  id: z.number(),
  createdAt: z.number(),
  agentConfigurationId: z.string(),
  scheduleConfig: WakeUpScheduleConfigSchema,
  reason: z.string(),
  status: WakeUpStatusSchema,
  fireCount: z.number(),
});
export type WakeUpType = z.infer<typeof WakeUpSchema>;
