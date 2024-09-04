import * as t from "io-ts";

import { createRangeCodec } from "../../../shared/utils/iots_utils";
import { TimeframeUnitCodec } from "../../assistant/actions/retrieval";
import {
  isSupportedModel,
  ModelIdCodec,
  ModelProviderIdCodec,
  SupportedModel,
} from "../../lib/assistant";

const LimitCodec = createRangeCodec(0, 100);

// Get schema for the url query parameters: a view parameter with all the types
// of AgentGetViewType
export const GetAgentConfigurationsQuerySchema = t.type({
  view: t.union([
    t.literal("list"),
    t.literal("workspace"),
    t.literal("published"),
    t.literal("global"),
    t.literal("admin_internal"),
    t.literal("all"),
    t.literal("assistants-search"),
    t.undefined,
  ]),
  conversationId: t.union([t.string, t.undefined]),
  withUsage: t.union([t.literal("true"), t.literal("false"), t.undefined]),
  withAuthors: t.union([t.literal("true"), t.literal("false"), t.undefined]),
  limit: t.union([LimitCodec, t.undefined]),
  sort: t.union([
    t.literal("priority"),
    t.literal("alphabetical"),
    t.undefined,
  ]),
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
      dataSourceId: t.string,
      dataSourceViewId: t.string,
      workspaceId: t.string,
      filter: t.type({
        parents: t.union([
          t.type({
            in: t.array(t.string),
            not: t.array(t.string),
          }),
          t.null,
        ]),
      }),
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
      dataSourceId: t.string,
      // TODO(GROUPS_INFRA) Make `dataSourceViewId` required.
      dataSourceViewId: t.union([t.string, t.undefined, t.null]),
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

const ProcessActionConfigurationSchema = t.type({
  type: t.literal("process_configuration"),
  dataSources: t.array(
    t.type({
      dataSourceId: t.string,
      dataSourceViewId: t.string,
      workspaceId: t.string,
      filter: t.type({
        parents: t.union([
          t.type({
            in: t.array(t.string),
            not: t.array(t.string),
          }),
          t.null,
        ]),
      }),
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
  tagsFilter: t.union([
    t.type({
      in: t.array(t.string),
    }),
    t.null,
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

const ActionConfigurationSchema = t.intersection([
  t.union([
    RetrievalActionConfigurationSchema,
    DustAppRunActionConfigurationSchema,
    TablesQueryActionConfigurationSchema,
    ProcessActionConfigurationSchema,
    WebsearchActionConfigurationSchema,
    BrowseActionConfigurationSchema,
  ]),
  t.partial(multiActionsCommonFields),
]);

const ModelConfigurationSchema = t.intersection([
  t.type({
    modelId: ModelIdCodec,
    providerId: ModelProviderIdCodec,
    temperature: t.number,
  }),
  t.partial(multiActionsCommonFields),
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
