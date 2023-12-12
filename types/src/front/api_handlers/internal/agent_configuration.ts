import * as t from "io-ts";

import { TimeframeUnitCodec } from "../../assistant/actions/retrieval";
import { isSupportedModel, SupportedModel } from "../../lib/assistant";

// Get schema for the url query parameters: a view parameter with all the types
// of AgentGetViewType
export const GetAgentConfigurationsQuerySchema = t.type({
  view: t.union([
    t.literal("list"),
    t.literal("super_user"),
    t.literal("all"),
    t.undefined,
  ]),
  conversationId: t.union([t.string, t.undefined]),
});

export const PostOrPatchAgentConfigurationRequestBodySchema = t.type({
  assistant: t.type({
    name: t.string,
    description: t.string,
    pictureUrl: t.string,
    status: t.union([t.literal("active"), t.literal("archived")]),
    scope: t.union([
      t.literal("workspace"),
      t.literal("published"),
      t.literal("private"),
    ]),
    action: t.union([
      t.null,
      t.type({
        type: t.literal("retrieval_configuration"),
        query: t.union([
          t.type({
            template: t.string,
          }),
          t.literal("auto"),
          t.literal("none"),
        ]),
        timeframe: t.union([
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
      }),
      t.type({
        type: t.literal("dust_app_run_configuration"),
        appWorkspaceId: t.string,
        appId: t.string,
      }),
      t.type({
        type: t.literal("database_query_configuration"),
        dataSourceWorkspaceId: t.string,
        dataSourceId: t.string,
        databaseId: t.string,
      }),
    ]),
    generation: t.type({
      prompt: t.string,
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
  }),
});
