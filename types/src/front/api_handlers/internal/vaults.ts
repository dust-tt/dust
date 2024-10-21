import * as t from "io-ts";

const PostRestrictedVault = t.type({
  memberIds: t.array(t.string),
  isRestricted: t.literal(true),
});

const PostUnrestrictedVault = t.type({
  memberIds: t.null,
  isRestricted: t.literal(false),
});

export const PostVaultRequestBodySchema = t.intersection([
  t.type({
    name: t.string,
  }),
  t.union([PostRestrictedVault, PostUnrestrictedVault]),
]);

export const PatchVaultMembersRequestBodySchema = t.union([
  PostRestrictedVault,
  PostUnrestrictedVault,
]);

export const ContentSchema = t.type({
  dataSourceId: t.string,
  parentsIn: t.array(t.string),
});

export const PatchVaultRequestBodySchema = t.type({
  name: t.union([t.string, t.undefined]),
  content: t.union([t.array(ContentSchema), t.undefined]),
});

export type PatchVaultRequestBodyType = t.TypeOf<
  typeof PatchVaultRequestBodySchema
>;

export const PostDataSourceViewSchema = ContentSchema;
