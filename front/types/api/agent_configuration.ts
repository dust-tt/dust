import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import { isSupportedModel } from "@app/types/assistant/assistant";
import { ModelIdSchema } from "@app/types/assistant/models/models";
import { ModelProviderIdSchema } from "@app/types/assistant/models/providers";
import { ReasoningEffortSchema } from "@app/types/assistant/models/reasoning";
import type { SupportedModel } from "@app/types/assistant/models/types";
import { TimeframeUnitSchema } from "@app/types/shared/utils/time_frame";
import type { JSONSchema7 } from "json-schema";
import { z } from "zod";

const LimitSchema = z.number().min(0).max(100);

// Get schema for the url query parameters: a view parameter with all the types
// of AgentGetViewType
export const GetAgentConfigurationsQuerySchema = z.object({
  view: z
    .enum([
      "admin_internal",
      "all",
      "archived",
      "current_user",
      "global",
      "list",
      "manage",
      "published",
      "workspace",
    ])
    .optional(),
  withUsage: z.enum(["true", "false"]).optional(),
  withAuthors: z.enum(["true", "false"]).optional(),
  withEditors: z.enum(["true", "false"]).optional(),
  withFeedbacks: z.enum(["true", "false"]).optional(),
  limit: LimitSchema.optional(),
  sort: z.enum(["priority", "alphabetical"]).optional(),
});

export const GetAgentConfigurationsHistoryQuerySchema = z.object({
  limit: LimitSchema.optional(),
});

// Data sources

const DataSourceFilterParentsSchema = z
  .object({
    in: z.array(z.string()).nullable(),
    not: z.array(z.string()).nullable(),
  })
  .nullable();

const DataSourceFilterTagsSchema = z
  .object({
    in: z.array(z.string()),
    not: z.array(z.string()),
    mode: z.enum(["custom", "auto"]),
  })
  .nullable()
  .optional();

const DataSourceFilterSchema = z.object({
  parents: DataSourceFilterParentsSchema,
  tags: DataSourceFilterTagsSchema,
});

const DataSourcesConfigurationsSchema = z.array(
  z.object({
    dataSourceViewId: z.string(),
    workspaceId: z.string(),
    filter: DataSourceFilterSchema,
  })
);
export type DataSourcesConfigurationsCodecType = z.infer<
  typeof DataSourcesConfigurationsSchema
>;

// Tables

const TablesConfigurationsSchema = z.array(
  z.object({
    dataSourceViewId: z.string(),
    tableId: z.string(),
    workspaceId: z.string(),
  })
);

// Projects

const ProjectConfigurationSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
});

// Actions

const DustAppRunActionConfigurationSchema = z.object({
  type: z.literal("dust_app_run_configuration"),
  appWorkspaceId: z.string(),
  appId: z.string(),
});

const JsonSchemaSchema = z.custom<JSONSchema7>(
  (val) => {
    if (typeof val !== "object" || val === null) {
      return false;
    }
    return validateJsonSchema(JSON.stringify(val)).isValid;
  },
  { message: "Invalid JSON schema" }
);

const MCPServerActionConfigurationSchema = z.object({
  type: z.literal("mcp_server_configuration"),
  mcpServerViewId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  dataSources: DataSourcesConfigurationsSchema.nullable(),
  tables: TablesConfigurationsSchema.nullable(),
  childAgentId: z.string().nullable(),
  timeFrame: z
    .object({
      duration: z.number(),
      unit: TimeframeUnitSchema,
    })
    .nullable(),
  jsonSchema: JsonSchemaSchema.nullable(),
  additionalConfiguration: z.record(
    z.string(),
    z.union([
      z.boolean(),
      z.number(),
      z.string(),
      z.array(z.string()),
      z.null(),
    ])
  ),
  dustAppConfiguration: DustAppRunActionConfigurationSchema.nullable(),
  secretName: z.string().nullable(),
  dustProject: ProjectConfigurationSchema.nullable(),
});

const ModelConfigurationSchema = z
  .object({
    modelId: ModelIdSchema,
    providerId: ModelProviderIdSchema,
    temperature: z.number(),
  })
  .extend({
    // TODO(2024-11-04 flav) Clean up this legacy type.
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    reasoningEffort: ReasoningEffortSchema.optional(),
    responseFormat: z.string().optional(),
  });

const IsSupportedModelSchema = z.custom<SupportedModel>(
  (val) => isSupportedModel(val),
  { message: "Unsupported model" }
);

const TagSchema = z.object({
  sId: z.string(),
  name: z.string(),
  kind: z.enum(["standard", "protected"]),
});

const EditorSchema = z.object({
  sId: z.string(),
});

const SkillSchema = z.object({
  sId: z.string(),
});

export const PostOrPatchAgentConfigurationRequestBodySchema = z.object({
  assistant: z
    .object({
      name: z.string(),
      description: z.string(),
      instructions: z.string().nullable(),
      pictureUrl: z.string(),
      status: z.enum(["active", "archived", "draft", "pending"]),
      scope: z.enum(["hidden", "visible"]),
      model: ModelConfigurationSchema.and(IsSupportedModelSchema),
      actions: z.array(MCPServerActionConfigurationSchema),
      templateId: z.string().nullable().optional(),
      tags: z.array(TagSchema),
      editors: z.array(EditorSchema),
    })
    .extend({
      // temporary partial so opened windows can save without refreshing
      skills: z.array(SkillSchema).optional(),
      additionalRequestedSpaceIds: z.array(z.string()).optional(),
      instructionsHtml: z.string().nullable().optional(),
    }),
});

export type PostOrPatchAgentConfigurationRequestBody = z.infer<
  typeof PostOrPatchAgentConfigurationRequestBodySchema
>;
