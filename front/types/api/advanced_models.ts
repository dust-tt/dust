// Shared contract types and schemas for the advanced models API,
// imported by the advanced models API routes.
import { ModelIdSchema } from "@app/types/assistant/models/models";
import { ModelProviderIdSchema } from "@app/types/assistant/models/providers";
import { z } from "zod";

export const AllowedAdvancedModelSchema = z.object({
  providerId: ModelProviderIdSchema,
  modelId: ModelIdSchema,
});
export type AllowedAdvancedModelType = z.infer<
  typeof AllowedAdvancedModelSchema
>;

export const AdvancedModelSchema = AllowedAdvancedModelSchema.extend({
  displayName: z.string(),
});
export type AdvancedModelType = z.infer<typeof AdvancedModelSchema>;

export const UserAllowedAdvancedModelsSchema = z.object({
  userId: z.string(),
  models: z.array(AllowedAdvancedModelSchema),
});
export type UserAllowedAdvancedModelsType = z.infer<
  typeof UserAllowedAdvancedModelsSchema
>;

export const GroupAllowedAdvancedModelsSchema = z.object({
  groupId: z.string(),
  models: z.array(AllowedAdvancedModelSchema),
});
export type GroupAllowedAdvancedModelsType = z.infer<
  typeof GroupAllowedAdvancedModelsSchema
>;

export const GetAdvancedModelsResponseBodySchema = z.object({
  models: z.array(AdvancedModelSchema),
});
export type GetAdvancedModelsResponseBody = z.infer<
  typeof GetAdvancedModelsResponseBodySchema
>;

export const GetUserAllowedAdvancedModelsResponseBodySchema = z.object({
  users: z.array(UserAllowedAdvancedModelsSchema),
});
export type GetUserAllowedAdvancedModelsResponseBody = z.infer<
  typeof GetUserAllowedAdvancedModelsResponseBodySchema
>;

export const GetGroupAllowedAdvancedModelsResponseBodySchema = z.object({
  groups: z.array(GroupAllowedAdvancedModelsSchema),
});
export type GetGroupAllowedAdvancedModelsResponseBody = z.infer<
  typeof GetGroupAllowedAdvancedModelsResponseBodySchema
>;

export const GetWorkspaceAllowedAdvancedModelsResponseBodySchema = z.object({
  models: z.array(AllowedAdvancedModelSchema),
});
export type GetWorkspaceAllowedAdvancedModelsResponseBody = z.infer<
  typeof GetWorkspaceAllowedAdvancedModelsResponseBodySchema
>;

export const AllowedAdvancedModelBodySchema = AllowedAdvancedModelSchema;

export const UserAllowedAdvancedModelBodySchema =
  AllowedAdvancedModelBodySchema.extend({
    userId: z.string(),
  });
export type UserAllowedAdvancedModelBody = z.infer<
  typeof UserAllowedAdvancedModelBodySchema
>;

export const GroupAllowedAdvancedModelBodySchema =
  AllowedAdvancedModelBodySchema.extend({
    groupId: z.string(),
  });
export type GroupAllowedAdvancedModelBody = z.infer<
  typeof GroupAllowedAdvancedModelBodySchema
>;
