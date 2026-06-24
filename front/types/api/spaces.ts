import type { AgentsUsageType } from "@app/types/data_source";
import type { PodType, SpaceType } from "@app/types/space";
import type { SpaceUserType } from "@app/types/user";
import { z } from "zod";

export const ContentSchema = z.object({
  dataSourceId: z.string(),
  parentsIn: z.array(z.string()),
});

export const PatchSpaceRequestBodySchema = z.object({
  name: z.string().optional(),
  content: z.array(ContentSchema).optional(),
});

export const PostDataSourceViewSchema = ContentSchema;

export const PostNotionSyncPayloadSchema = z.object({
  urls: z.array(z.string()),
  method: z.enum(["sync", "delete"]),
});

export const GetPostNotionSyncResponseBodySchema = z.object({
  syncResults: z.array(
    z.object({
      url: z.string(),
      method: z.enum(["sync", "delete"]),
      timestamp: z.number(),
      success: z.boolean(),
      error_message: z.string().optional(),
    })
  ),
});

export type GetPostNotionSyncResponseBody = z.infer<
  typeof GetPostNotionSyncResponseBodySchema
>;

export const PatchPodMetadataBodySchema = z.object({
  description: z.string().optional(),
  archive: z.boolean().optional(),
  todoGenerationEnabled: z.boolean().optional(),
  initialTodoAnalysisLookback: z.enum(["now", "last_24h", "max"]).optional(),
  pinnedFramePath: z.string().nullable().optional(),
  defaultAgentId: z.string().nullable().optional(),
});

export type PatchPodMetadataBodyType = z.infer<
  typeof PatchPodMetadataBodySchema
>;

export const PostSpaceRequestBodySchema = z.intersection(
  z.object({
    isRestricted: z.boolean(),
    name: z.string(),
    spaceKind: z.enum(["regular", "project"]),
  }),
  z.discriminatedUnion("managementMode", [
    z.object({
      memberIds: z.array(z.string()),
      managementMode: z.literal("manual"),
    }),
    z.object({
      groupIds: z.array(z.string()),
      managementMode: z.literal("group"),
    }),
  ])
);

export type PostSpaceRequestBodyType = z.infer<
  typeof PostSpaceRequestBodySchema
>;

export type GetSpacesResponseBody = {
  spaces: (SpaceType | PodType)[];
};

export type PostSpacesResponseBody = {
  space: SpaceType;
};

export type SpaceCategoryInfo = {
  usage: AgentsUsageType;
  count: number;
};

export type RichSpaceType = SpaceType & {
  categories: { [key: string]: SpaceCategoryInfo };
  canWrite: boolean;
  canRead: boolean;
  isMember: boolean;
  members: SpaceUserType[];
  isEditor: boolean;
  // Useful in case of projects
  description: string | null;
  archivedAt: number | null;
  /** Background todo suggestions from project activity (project spaces only). */
  todoGenerationEnabled: boolean;
  lastTodoAnalysisAt: number | null;
  pinnedFramePath: string | null;
};

export type GetSpaceResponseBody = {
  space: RichSpaceType;
};

export type PatchSpaceResponseBody = {
  space: SpaceType;
};

export type CheckNameResponseBody = {
  available: boolean;
};
