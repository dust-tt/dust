import * as t from "io-ts";

import { createRangeCodec } from "../../../shared/utils/iots_utils";
import { TimeframeUnitCodec } from "../../assistant/actions/retrieval";
import { isSupportedModel, SupportedModel } from "../../lib/assistant";

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
    t.literal("manage-assistants-search"),
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
      workspaceId: t.string,
      filter: t.type({
        tags: t.union([
          t.type({
            in: t.array(t.string),
            not: t.array(t.string),
          }),
          t.null,
        ]),
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
      workspaceId: t.string,
      dataSourceId: t.string,
      tableId: t.string,
    })
  ),
});

const ProcessActionConfigurationSchema = t.type({
  type: t.literal("process_configuration"),
  relativeTimeFrame: t.union([
    t.literal("auto"),
    t.literal("none"),
    t.type({
      duration: t.number,
      unit: TimeframeUnitCodec,
    }),
  ]),
  dataSources: t.array(
    t.type({
      dataSourceId: t.string,
      workspaceId: t.string,
      filter: t.type({
        tags: t.union([
          t.type({
            in: t.array(t.string),
            not: t.array(t.string),
          }),
          t.null,
        ]),
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
  forceUseAtIteration: t.union([t.number, t.null]),
};

const ActionConfigurationSchema = t.intersection([
  t.union([
    RetrievalActionConfigurationSchema,
    DustAppRunActionConfigurationSchema,
    TablesQueryActionConfigurationSchema,
    ProcessActionConfigurationSchema,
  ]),
  t.partial(multiActionsCommonFields),
]);

// TODO(@fontanierh): change once generation is an action.
const GenerationConfigurationSchema = t.union([
  t.null,
  t.intersection([
    t.type({
      // enforce that the model is a supported model
      // the modelId and providerId are checked together, so
      // (gpt-4, anthropic) won't pass
      model: new t.Type<SupportedModel>(
        "SupportedModel",
        isSupportedModel,
        (i, c) => (isSupportedModel(i) ? t.success(i) : t.failure(i, c)),
        t.identity
      ),
      temperature: t.number,
    }),
    t.partial(multiActionsCommonFields),
  ]),
]);

export const PostOrPatchAgentConfigurationRequestBodySchema = t.intersection([
  t.type({
    assistant: t.intersection([
      t.type({
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
        actions: t.array(ActionConfigurationSchema),
        generation: GenerationConfigurationSchema,
      }),
      t.partial({
        maxToolsUsePerRun: t.number,
      }),
    ]),
  }),
  t.partial({
    useMultiActions: t.boolean,
  }),
]);

export type PostOrPatchAgentConfigurationRequestBody = t.TypeOf<
  typeof PostOrPatchAgentConfigurationRequestBodySchema
>;
