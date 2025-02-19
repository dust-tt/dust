import * as t from "io-ts";

import { createRangeCodec } from "../../../shared/utils/iots_utils";
import { TimeframeUnitCodec } from "../../assistant/actions/retrieval";
import {
  isSupportedModel,
  ModelIdCodec,
  ModelProviderIdCodec,
  ReasoningEffortCodec,
  SupportedModel,
} from "../../lib/assistant";

const LimitCodec = createRangeCodec(0, 100);

// Get schema for the url query parameters: a view parameter with all the types
// of AgentGetViewType
export const GetAgentConfigurationsQuerySchema = t.type({
  view: t.union([
    t.literal("current_user"),
    t.literal("list"),
    t.literal("workspace"),
    t.literal("published"),
    t.literal("global"),
    t.literal("admin_internal"),
    t.literal("all"),
    t.undefined,
  ]),
  withUsage: t.union([t.literal("true"), t.literal("false"), t.undefined]),
  withAuthors: t.union([t.literal("true"), t.literal("false"), t.undefined]),
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

export const GetAgentConfigurationsLeaderboardQuerySchema = t.type({
  view: t.union([
    t.literal("list"),
    t.literal("workspace"),
    t.literal("published"),
    t.literal("global"),
    t.literal("admin_internal"),
    t.literal("manage-assistants-search"),
    t.literal("all"),
  ]),
});

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

const RetrievalActionConfigurationSchema = t.type({
  type: t.literal("retrieval_configuration"),
  query: t.union([t.literal("auto"), t.literal("none")]),
  relativeTimeFrame: t.union([
    t.literal("auto"),
    t.literal("none"),
    t.type({
      duration: t.number,
      unit: TimeframeUnitCodec,
    }),
  ]),
  topK: t.union([t.number, t.literal("auto")]),
  dataSources: t.array(
    t.type({
      dataSourceViewId: t.string,
      workspaceId: t.string,
      filter: DataSourceFilterCodec,
    })
  ),
});

const DustAppRunActionConfigurationSchema = t.type({
  type: t.literal("dust_app_run_configuration"),
  appWorkspaceId: t.string,
  appId: t.string,
});

const TablesQueryActionConfigurationSchema = t.type({
  type: t.literal("tables_query_configuration"),
  tables: t.array(
    t.type({
      dataSourceViewId: t.string,
      tableId: t.string,
      workspaceId: t.string,
    })
  ),
});

const WebsearchActionConfigurationSchema = t.type({
  type: t.literal("websearch_configuration"),
});

const BrowseActionConfigurationSchema = t.type({
  type: t.literal("browse_configuration"),
});

const GithubGetPullRequestActionConfigurationSchema = t.type({
  type: t.literal("github_get_pull_request_configuration"),
});

const GithubCreateIssueActionConfigurationSchema = t.type({
  type: t.literal("github_create_issue_configuration"),
});

const ReasoningActionConfigurationSchema = t.type({
  type: t.literal("reasoning_configuration"),
  modelId: ModelIdCodec,
  providerId: ModelProviderIdCodec,
  temperature: t.union([t.number, t.null]),
  reasoningEffort: t.union([ReasoningEffortCodec, t.null]),
});

const ProcessActionConfigurationSchema = t.type({
  type: t.literal("process_configuration"),
  dataSources: t.array(
    t.type({
      dataSourceViewId: t.string,
      workspaceId: t.string,
      filter: DataSourceFilterCodec,
    })
  ),
  relativeTimeFrame: t.union([
    t.literal("auto"),
    t.literal("none"),
    t.type({
      duration: t.number,
      unit: TimeframeUnitCodec,
    }),
  ]),
  schema: t.array(
    t.type({
      name: t.string,
      type: t.union([
        t.literal("string"),
        t.literal("number"),
        t.literal("boolean"),
      ]),
      description: t.string,
    })
  ),
});

const multiActionsCommonFields = {
  name: t.union([t.string, t.null]),
  description: t.union([t.string, t.null]),
};

const requiredMultiActionsCommonFields = t.type({
  name: t.string,
  description: t.union([t.string, t.null]),
});

const ActionConfigurationSchema = t.intersection([
  t.union([
    RetrievalActionConfigurationSchema,
    DustAppRunActionConfigurationSchema,
    TablesQueryActionConfigurationSchema,
    ProcessActionConfigurationSchema,
    WebsearchActionConfigurationSchema,
    BrowseActionConfigurationSchema,
    GithubGetPullRequestActionConfigurationSchema,
    GithubCreateIssueActionConfigurationSchema,
    ReasoningActionConfigurationSchema,
  ]),
  requiredMultiActionsCommonFields,
]);

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
]);
const IsSupportedModelSchema = new t.Type<SupportedModel>(
  "SupportedModel",
  isSupportedModel,
  (i, c) => (isSupportedModel(i) ? t.success(i) : t.failure(i, c)),
  t.identity
);

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
    scope: t.union([
      t.literal("workspace"),
      t.literal("published"),
      t.literal("private"),
    ]),
    model: t.intersection([ModelConfigurationSchema, IsSupportedModelSchema]),
    actions: t.array(ActionConfigurationSchema),
    templateId: t.union([t.string, t.null, t.undefined]),
    maxStepsPerRun: t.union([t.number, t.undefined]),
    visualizationEnabled: t.boolean,
  }),
});

export type PostOrPatchAgentConfigurationRequestBody = t.TypeOf<
  typeof PostOrPatchAgentConfigurationRequestBodySchema
>;
