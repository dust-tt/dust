import * as t from "io-ts";
import type { JSONSchema7 } from "json-schema";

import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import type { SupportedModel } from "@app/types/assistant/assistant";
import {
  isSupportedModel,
  ModelIdCodec,
  ModelProviderIdCodec,
  ReasoningEffortCodec,
} from "@app/types/assistant/assistant";
import { createRangeCodec } from "@app/types/shared/utils/iots_utils";
import { TimeframeUnitCodec } from "@app/types/shared/utils/time_frame";

const LimitCodec = createRangeCodec(0, 100);

// Get schema for the url query parameters: a view parameter with all the types
// of AgentGetViewType
export const GetAgentConfigurationsQuerySchema = t.type({
  view: t.union([
    t.literal("admin_internal"),
    t.literal("all"),
    t.literal("archived"),
    t.literal("current_user"),
    t.literal("global"),
    t.literal("list"),
    t.literal("manage"),
    t.literal("published"),
    t.literal("workspace"),
    t.undefined,
  ]),
  withUsage: t.union([t.literal("true"), t.literal("false"), t.undefined]),
  withAuthors: t.union([t.literal("true"), t.literal("false"), t.undefined]),
  withEditors: t.union([t.literal("true"), t.literal("false"), t.undefined]),
  withFeedbacks: t.union([t.literal("true"), t.literal("false"), t.undefined]),
  limit: t.union([LimitCodec, t.undefined]),
  sort: t.union([
    t.literal("priority"),
    t.literal("alphabetical"),
    t.undefined,
  ]),
});

export const GetAgentConfigurationsHistoryQuerySchema = t.type({
  limit: t.union([LimitCodec, t.undefined]),
});

// Data sources

const DataSourceFilterParentsCodec = t.union([
  t.type({
    in: t.array(t.string),
    not: t.array(t.string),
  }),
  t.null,
]);

const OptionalDataSourceFilterTagsCodec = t.partial({
  tags: t.union([
    t.type({
      in: t.array(t.string),
      not: t.array(t.string),
      mode: t.union([t.literal("custom"), t.literal("auto")]),
    }),
    t.null,
  ]),
});

const DataSourceFilterCodec = t.intersection([
  t.type({ parents: DataSourceFilterParentsCodec }),
  OptionalDataSourceFilterTagsCodec,
]);

const DataSourcesConfigurationsCodec = t.array(
  t.type({
    dataSourceViewId: t.string,
    workspaceId: t.string,
    filter: DataSourceFilterCodec,
  })
);
export type DataSourcesConfigurationsCodecType = t.TypeOf<
  typeof DataSourcesConfigurationsCodec
>;

// Tables

const TablesConfigurationsCodec = t.array(
  t.type({
    dataSourceViewId: t.string,
    tableId: t.string,
    workspaceId: t.string,
  })
);

// Reasoning

const ReasoningModelConfigurationSchema = t.type({
  modelId: ModelIdCodec,
  providerId: ModelProviderIdCodec,
  reasoningEffort: t.union([t.null, ReasoningEffortCodec]),
});

// Actions

const DustAppRunActionConfigurationSchema = t.type({
  type: t.literal("dust_app_run_configuration"),
  appWorkspaceId: t.string,
  appId: t.string,
});

const JsonSchemaCodec = new t.Type<JSONSchema7, unknown, unknown>(
  "JsonSchema",
  (u): u is JSONSchema7 => {
    if (typeof u !== "object" || u === null) {
      return false;
    }
    return validateJsonSchema(JSON.stringify(u)).isValid;
  },
  (u, c) => {
    if (typeof u !== "object" || u === null) {
      return t.failure(u, c, "Invalid JSON schema");
    }
    const validation = validateJsonSchema(JSON.stringify(u));
    return validation.isValid
      ? t.success(u as JSONSchema7)
      : t.failure(u, c, validation.error ?? "Invalid JSON schema");
  },
  t.identity
);

const MCPServerActionConfigurationSchema = t.type({
  type: t.literal("mcp_server_configuration"),
  mcpServerViewId: t.string,
  name: t.string,
  description: t.union([t.string, t.null]),
  dataSources: t.union([t.null, DataSourcesConfigurationsCodec]),
  tables: t.union([t.null, TablesConfigurationsCodec]),
  childAgentId: t.union([t.null, t.string]),
  reasoningModel: t.union([t.null, ReasoningModelConfigurationSchema]),
  timeFrame: t.union([
    t.null,
    t.type({
      duration: t.number,
      unit: TimeframeUnitCodec,
    }),
  ]),
  jsonSchema: t.union([JsonSchemaCodec, t.null]),
  additionalConfiguration: t.record(
    t.string,
    t.union([t.boolean, t.number, t.string, t.array(t.string), t.null])
  ),
  dustAppConfiguration: t.union([DustAppRunActionConfigurationSchema, t.null]),
  secretName: t.union([t.string, t.null]),
});

const multiActionsCommonFields = {
  name: t.union([t.string, t.null]),
  description: t.union([t.string, t.null]),
};

const ModelConfigurationSchema = t.intersection([
  t.type({
    modelId: ModelIdCodec,
    providerId: ModelProviderIdCodec,
    temperature: t.number,
  }),
  // TODO(2024-11-04 flav) Clean up this legacy type.
  t.partial(multiActionsCommonFields),
  t.partial({
    reasoningEffort: ReasoningEffortCodec,
  }),
  t.partial({ responseFormat: t.string }),
]);
const IsSupportedModelSchema = new t.Type<SupportedModel>(
  "SupportedModel",
  isSupportedModel,
  (i, c) => (isSupportedModel(i) ? t.success(i) : t.failure(i, c)),
  t.identity
);

const TagSchema = t.type({
  sId: t.string,
  name: t.string,
  kind: t.union([t.literal("standard"), t.literal("protected")]),
});

const EditorSchema = t.type({
  sId: t.string,
});

export const PostOrPatchAgentConfigurationRequestBodySchema = t.type({
  assistant: t.type({
    name: t.string,
    description: t.string,
    instructions: t.union([t.string, t.null]),
    pictureUrl: t.string,
    status: t.union([
      t.literal("active"),
      t.literal("archived"),
      t.literal("draft"),
    ]),
    scope: t.union([t.literal("hidden"), t.literal("visible")]),
    model: t.intersection([ModelConfigurationSchema, IsSupportedModelSchema]),
    actions: t.array(MCPServerActionConfigurationSchema),
    templateId: t.union([t.string, t.null, t.undefined]),
    visualizationEnabled: t.boolean,
    tags: t.array(TagSchema),
    editors: t.array(EditorSchema),
  }),
});

export type PostOrPatchAgentConfigurationRequestBody = t.TypeOf<
  typeof PostOrPatchAgentConfigurationRequestBodySchema
>;
