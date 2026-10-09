import type { AdditionalConfigurationInBuilderType } from "@app/components/shared/tools_picker/types";
import {
  actionSchema,
  generationSettingsSchema,
} from "@app/components/shared/tools_picker/types";
import type { AgentNameFormatErrorCode } from "@app/lib/agent_builder/helpers";
import { getAgentNameFormatErrorCode } from "@app/lib/agent_builder/helpers";
import type { ProjectConfiguration } from "@app/lib/api/assistant/configuration/types";
import { WEBHOOK_PROVIDERS } from "@app/lib/triggers/webhooks";
import {
  MAX_AGENT_SUGGESTED_PROMPT_LENGTH,
  MAX_AGENT_SUGGESTED_PROMPTS,
} from "@app/types/api/assistant/configuration/suggested_prompts";
import { AGENT_NAME_MAX_LENGTH } from "@app/types/assistant/agent";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration";
import {
  TRIGGER_EXECUTION_MODES,
  TRIGGER_STATUSES,
} from "@app/types/assistant/triggers";
import { editorUserSchema } from "@app/types/editors";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";

const TAG_KINDS = z.union([z.literal("standard"), z.literal("protected")]);

const tagSchema = z.object({
  sId: z.string(),
  name: z.string(),
  kind: TAG_KINDS,
});

const AGENT_NAME_FORMAT_ERROR_MESSAGES: Record<
  AgentNameFormatErrorCode,
  MessageDescriptor
> = {
  empty: msg`Agent name cannot be empty.`,
  too_long: msg`Agent name must be at most ${AGENT_NAME_MAX_LENGTH} characters.`,
  contains_spaces: msg`Agent name cannot contain spaces.`,
};

const getAgentSettingsSchema = (t: (descriptor: MessageDescriptor) => string) =>
  z.object({
    name: z.string().superRefine((value, ctx) => {
      const errorCode = getAgentNameFormatErrorCode(value);
      if (errorCode) {
        ctx.addIssue({
          code: "custom",
          message: t(AGENT_NAME_FORMAT_ERROR_MESSAGES[errorCode]),
        });
      }
    }),
    description: z.string().min(1, t(msg`Agent description is required`)),
    pictureUrl: z.string().optional(),
    scope: z.enum(["hidden", "visible"]),
    editors: z.array(editorUserSchema),
    slackProvider: z.enum(["slack", "slack_bot"]).nullable(),
    slackChannels: z.array(
      z.object({
        slackChannelId: z.string(),
        slackChannelName: z.string(),
        autoRespondWithoutMention: z.boolean().optional(),
        autoRespondWithoutMentionSkipThreadReplies: z.boolean().optional(),
        isPrivate: z.boolean(),
      })
    ),
    tags: z.array(tagSchema),
    ignoreCreditSpendThresholdAlert: z.boolean().default(false),
  });

const cronScheduleConfigSchema = z.object({
  type: z.literal("cron").optional(),
  cron: z.string(),
  timezone: z.string(),
});

const intervalScheduleConfigSchema = z.object({
  type: z.literal("interval"),
  intervalDays: z.number(),
  dayOfWeek: z.number().nullable(),
  hour: z.number(),
  minute: z.number(),
  timezone: z.string(),
});

const scheduleConfigSchema = z.union([
  cronScheduleConfigSchema,
  intervalScheduleConfigSchema,
]);

const webhookConfigSchema = z.object({
  includePayload: z.boolean(),
  event: z.string().optional(),
  filter: z.string().optional(),
});

export const triggerStatusSchema = z.enum(TRIGGER_STATUSES);

const webhookTriggerSchema = z.object({
  sId: z.string().optional(),
  status: triggerStatusSchema.default("enabled"),
  name: z.string(),
  kind: z.enum(["webhook"]),
  provider: z.enum(WEBHOOK_PROVIDERS).optional(),
  customPrompt: z.string().nullable(),
  naturalLanguageDescription: z.string().nullable(),
  configuration: webhookConfigSchema,
  editor: z.number().nullable(),
  webhookSourceViewId: z.string().nullable().optional(),
  editorName: z.string().optional(),
  executionPerDayLimitOverride: z.number().nullable(),
  executionMode: z.enum(TRIGGER_EXECUTION_MODES),
  spaceId: z.string().nullable().optional(),
});

const scheduleTriggerSchema = z.object({
  sId: z.string().optional(),
  status: triggerStatusSchema.default("enabled"),
  name: z.string(),
  kind: z.enum(["schedule"]),
  customPrompt: z.string().nullable(),
  naturalLanguageDescription: z.string().nullable(),
  configuration: scheduleConfigSchema,
  editor: z.number().nullable(),
  editorName: z.string().optional(),
  executionMode: z.enum(TRIGGER_EXECUTION_MODES),
  spaceId: z.string().nullable().optional(),
});

const triggerSchema = z.discriminatedUnion("kind", [
  webhookTriggerSchema,
  scheduleTriggerSchema,
]);

const skillsSchema = z.object({
  sId: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string().nullable(),
  availability: z.enum(SKILL_AVAILABILITIES),
  requestedSpaceIds: z.array(z.string()),
  // Whether the current user is an editor of the skill.
  canWrite: z.boolean(),
});

// Additional space IDs selected by the user for global skills
const additionalSpacesSchema = z.array(z.string());

export type AgentBuilderWebhookTriggerType = z.infer<
  typeof webhookTriggerSchema
>;
export type AgentBuilderScheduleTriggerType = z.infer<
  typeof scheduleTriggerSchema
>;

export const getAgentBuilderFormSchema = (
  t: (descriptor: MessageDescriptor) => string
) =>
  z.object({
    agentSettings: getAgentSettingsSchema(t),
    instructions: z.string().min(1, t(msg`Instructions are required`)),
    instructionsHtml: z.string().optional(),
    generationSettings: generationSettingsSchema,
    skills: z.array(skillsSchema),
    additionalSpaces: additionalSpacesSchema,
    actions: z.array(actionSchema),
    triggersToCreate: z.array(triggerSchema),
    triggersToUpdate: z.array(triggerSchema),
    triggersToDelete: z.array(z.string()),
    suggestedPrompts: z
      .array(
        z.object({ prompt: z.string().max(MAX_AGENT_SUGGESTED_PROMPT_LENGTH) })
      )
      .max(MAX_AGENT_SUGGESTED_PROMPTS),
    maxStepsPerRun: z
      .number()
      .min(1, t(msg`Max steps per run must be at least 1`))
      .default(8),
  });

export type AgentBuilderFormData = z.infer<
  ReturnType<typeof getAgentBuilderFormSchema>
>;

export type AgentBuilderSkillsType = z.infer<typeof skillsSchema>;
export type AgentBuilderTriggerType = z.infer<typeof triggerSchema>;

// TODO: create types from schema
export interface MCPFormData {
  name: string;
  description: string;
  configuration: {
    mcpServerViewId: string;
    dataSourceConfigurations: any;
    tablesConfigurations: any;
    childAgentId: string | null;
    timeFrame: {
      duration: number;
      unit: "hour" | "day" | "week" | "month" | "year";
    } | null;
    additionalConfiguration: AdditionalConfigurationInBuilderType;
    dustAppConfiguration: any;
    dustProject: ProjectConfiguration | null;
    secretName: string | null;
    jsonSchema: any;
    _jsonSchemaString: string | null;
  };
}
