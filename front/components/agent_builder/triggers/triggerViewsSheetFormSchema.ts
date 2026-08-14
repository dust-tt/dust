import { ScheduleFormSchema } from "@app/components/agent_builder/triggers/schedule/scheduleEditionFormSchema";
import { WebhookFormSchema } from "@app/components/agent_builder/triggers/webhook/webhookEditionFormSchema";
import { z } from "zod";

export const TriggerViewsSheetFormSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("schedule"),
    schedule: ScheduleFormSchema,
  }),
  z.object({
    type: z.literal("webhook"),
    webhook: WebhookFormSchema,
  }),
  z.object({
    type: z.literal("monitor"),
    monitor: z.object({
      sId: z.string().optional(),
      status: z.enum(["enabled", "disabled"]),
      name: z.string().min(1),
      q: z.string().nullable(),
      maxResults: z.number().int().min(1).max(50),
      intervalMinutes: z.union([
        z.literal(2),
        z.literal(15),
        z.literal(60),
        z.literal(360),
        z.literal(1440),
      ]),
      customPrompt: z.string().nullable(),
      naturalLanguageDescription: z.string().nullable(),
      editor: z.number().nullable(),
      editorName: z.string().optional(),
      spaceId: z.string().nullable().optional(),
    }),
  }),
  z.object({
    type: z.literal("mcp-monitor"),
    mcpMonitor: z.object({
      name: z.string().min(1),
      mcpServerViewId: z.string().min(1),
      toolName: z.string().min(1),
      inputJson: z.string(),
      intervalMinutes: z.union([
        z.literal(2),
        z.literal(15),
        z.literal(60),
        z.literal(360),
        z.literal(1440),
      ]),
      customPrompt: z.string().nullable(),
      status: z.enum(["enabled", "disabled"]),
      editor: z.number().nullable(),
      naturalLanguageDescription: z.string().nullable(),
      spaceId: z.string().nullable(),
    }),
  }),
]);

export type TriggerViewsSheetFormValues = z.infer<
  typeof TriggerViewsSheetFormSchema
>;
