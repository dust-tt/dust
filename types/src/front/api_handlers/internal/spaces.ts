import * as t from "io-ts";

const PostRestrictedSpace = t.type({
  memberIds: t.array(t.string),
  isRestricted: t.literal(true),
});

const PostUnrestrictedSpace = t.type({
  memberIds: t.null,
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

export const PostDataSourceViewSchema = ContentSchema;
