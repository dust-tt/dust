import * as t from "io-ts";
const PostRestrictedSpace = t.intersection([
  t.type({
    isRestricted: t.literal(true),
  }),
  t.union([
    t.type({
      memberIds: t.array(t.string),
      managementMode: t.literal("manual"),
    }),
    t.type({
      groupIds: t.array(t.string),
      managementMode: t.literal("group"),
    }),
  ]),
]);

const PostUnrestrictedSpace = t.type({
  isRestricted: t.literal(false),
});

export const PostSpaceRequestBodySchema = t.intersection([
  t.type({
    name: t.string,
  }),
  t.union([PostRestrictedSpace, PostUnrestrictedSpace]),
]);

export const PatchSpaceMembersRequestBodySchema = t.union([
  PostRestrictedSpace,
  PostUnrestrictedSpace,
]);

export const ContentSchema = t.type({
  dataSourceId: t.string,
  parentsIn: t.array(t.string),
});

export const PatchSpaceRequestBodySchema = t.type({
  name: t.union([t.string, t.undefined]),
  content: t.union([t.array(ContentSchema), t.undefined]),
});

const PostDataSourceViewSchema = ContentSchema;

export const PostNotionSyncPayloadSchema = t.type({
  urls: t.array(t.string),
  method: t.union([t.literal("sync"), t.literal("delete")]),
});

export const GetPostNotionSyncResponseBodySchema = t.type({
  syncResults: t.array(
    t.intersection([
      t.type({
        url: t.string,
        method: t.union([t.literal("sync"), t.literal("delete")]),
        timestamp: t.number,
        success: t.boolean,
      }),
      t.partial({
        error_message: t.string,
      }),
    ])
  ),
});

export type GetPostNotionSyncResponseBody = t.TypeOf<
  typeof GetPostNotionSyncResponseBodySchema
>;
