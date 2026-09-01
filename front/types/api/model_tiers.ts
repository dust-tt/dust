import { MODELS_TIER_NAMES } from "@app/types/assistant/models/model_tiers";
import { z } from "zod";

const ModelsTierNameSchema = z.enum(MODELS_TIER_NAMES);
const ModelTierDefinitionSchema = z.object({
  name: ModelsTierNameSchema,
  id: z.number(),
  description: z.string(),
});
export const UserAllowedModelTiersSchema = z.object({
  userId: z.string(),
  maxTierName: ModelsTierNameSchema,
});
export type UserAllowedModelTiersType = z.infer<
  typeof UserAllowedModelTiersSchema
>;

export const GroupAllowedModelTiersSchema = z.object({
  groupId: z.string(),
  maxTierName: ModelsTierNameSchema,
});
export type GroupAllowedModelTiersType = z.infer<
  typeof GroupAllowedModelTiersSchema
>;

export const GetModelTiersResponseBodySchema = z.object({
  tiers: z.array(ModelTierDefinitionSchema),
});
export type GetModelTiersResponseBody = z.infer<
  typeof GetModelTiersResponseBodySchema
>;

export const GetUserAllowedModelTiersResponseBodySchema = z.object({
  users: z.array(UserAllowedModelTiersSchema),
});
export type GetUserAllowedModelTiersResponseBody = z.infer<
  typeof GetUserAllowedModelTiersResponseBodySchema
>;

export const GetGroupAllowedModelTiersResponseBodySchema = z.object({
  groups: z.array(GroupAllowedModelTiersSchema),
});
export type GetGroupAllowedModelTiersResponseBody = z.infer<
  typeof GetGroupAllowedModelTiersResponseBodySchema
>;

export const GetWorkspaceAllowedModelTiersResponseBodySchema = z.object({
  maxTierName: ModelsTierNameSchema,
});
export type GetWorkspaceAllowedModelTiersResponseBody = z.infer<
  typeof GetWorkspaceAllowedModelTiersResponseBodySchema
>;

export const GetPokeAllowedModelTiersResponseBodySchema = z.object({
  users: z.array(UserAllowedModelTiersSchema),
  groups: z.array(GroupAllowedModelTiersSchema),
  maxTierName: ModelsTierNameSchema,
});
export type GetPokeAllowedModelTiersResponseBody = z.infer<
  typeof GetPokeAllowedModelTiersResponseBodySchema
>;

export const AllowedModelTierBodySchema = z.object({
  tierName: ModelsTierNameSchema,
});
export type AllowedModelTierBody = z.infer<typeof AllowedModelTierBodySchema>;

export const UserAllowedModelTierBodySchema = AllowedModelTierBodySchema.extend(
  {
    userId: z.string(),
  }
);
export type UserAllowedModelTierBody = z.infer<
  typeof UserAllowedModelTierBodySchema
>;

export const GroupAllowedModelTierBodySchema =
  AllowedModelTierBodySchema.extend({
    groupId: z.string(),
  });
export type GroupAllowedModelTierBody = z.infer<
  typeof GroupAllowedModelTierBodySchema
>;

export const UserAllowedModelTierClearBodySchema = z.object({
  userId: z.string(),
});
export type UserAllowedModelTierClearBody = z.infer<
  typeof UserAllowedModelTierClearBodySchema
>;

export const GroupAllowedModelTierClearBodySchema = z.object({
  groupId: z.string(),
});
export type GroupAllowedModelTierClearBody = z.infer<
  typeof GroupAllowedModelTierClearBodySchema
>;
