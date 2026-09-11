import { z } from "zod";

// Cursor's v1 API is in public beta and returns values its published OpenAPI
// enums do not list (agent `status` is documented as ACTIVE|ARCHIVED but also
// returns IDLE). Enum drift must not reject a whole response, so upstream
// status and type fields are parsed as open strings and surfaced verbatim.
const CursorOpenEnumSchema = z.string().min(1);

const CursorEnvironmentSchema = z
  .object({
    // Known values: cloud, pool, machine.
    type: CursorOpenEnumSchema,
    name: z.string().optional(),
  })
  .passthrough();

const CursorRepositorySchema = z
  .object({
    url: z.string(),
    startingRef: z.string().optional(),
    prUrl: z.string().optional(),
  })
  .passthrough();

export const CursorAgentSummarySchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    // Known values: ACTIVE, IDLE, ARCHIVED.
    status: CursorOpenEnumSchema,
    env: CursorEnvironmentSchema,
    url: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    latestRunId: z.string().optional(),
  })
  .passthrough();

export const CursorAgentSchema = CursorAgentSummarySchema.extend({
  repos: z.array(CursorRepositorySchema).optional(),
  workOnCurrentBranch: z.boolean().optional(),
  autoCreatePR: z.boolean().optional(),
  skipReviewerRequest: z.boolean().optional(),
}).passthrough();

const CursorGitBranchSchema = z
  .object({
    repoUrl: z.string(),
    branch: z.string().optional(),
    prUrl: z.string().optional(),
  })
  .passthrough();

export const CursorRunSchema = z
  .object({
    id: z.string(),
    agentId: z.string(),
    // Known values: CREATING, RUNNING, FINISHED, ERROR, CANCELLED, EXPIRED.
    status: CursorOpenEnumSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    durationMs: z.number().optional(),
    result: z.string().optional(),
    git: z
      .object({
        branches: z.array(CursorGitBranchSchema),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const CreateCursorAgentResponseSchema = z
  .object({
    agent: CursorAgentSchema,
    run: CursorRunSchema,
  })
  .passthrough();

export const ListCursorAgentsResponseSchema = z
  .object({
    items: z.array(CursorAgentSummarySchema),
    nextCursor: z.string().optional(),
  })
  .passthrough();

export const CreateCursorRunResponseSchema = z
  .object({
    run: CursorRunSchema,
  })
  .passthrough();

export const ListCursorRunsResponseSchema = z
  .object({
    items: z.array(CursorRunSchema),
    nextCursor: z.string().optional(),
  })
  .passthrough();

const CursorTokenUsageSchema = z
  .object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheWriteTokens: z.number(),
    cacheReadTokens: z.number(),
    totalTokens: z.number(),
  })
  .passthrough();

export const CursorAgentUsageResponseSchema = z
  .object({
    totalUsage: CursorTokenUsageSchema,
    runs: z.array(
      z
        .object({
          id: z.string(),
          usageUuid: z.string().optional(),
          usage: CursorTokenUsageSchema,
        })
        .passthrough()
    ),
  })
  .passthrough();

export const CursorArtifactsResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          path: z.string(),
          sizeBytes: z.number(),
          updatedAt: z.string(),
        })
        .passthrough()
    ),
  })
  .passthrough();

export const CursorArtifactDownloadResponseSchema = z
  .object({
    url: z.string(),
    expiresAt: z.string(),
  })
  .passthrough();

export const CursorApiKeyInfoSchema = z
  .object({
    apiKeyName: z.string(),
    createdAt: z.string(),
    userId: z.number().optional(),
    userEmail: z.string().optional(),
    userFirstName: z.string().optional(),
    userLastName: z.string().optional(),
  })
  .passthrough();

export const CursorModelsResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          displayName: z.string(),
          description: z.string().optional(),
          aliases: z.array(z.string()).optional(),
          parameters: z.array(z.unknown()).optional(),
          variants: z.array(z.unknown()).optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();

export const CursorRepositoriesResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          url: z.string(),
        })
        .passthrough()
    ),
  })
  .passthrough();

export const CursorIdResponseSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

export type CursorAgent = z.infer<typeof CursorAgentSchema>;
export type CursorAgentSummary = z.infer<typeof CursorAgentSummarySchema>;
export type CursorRun = z.infer<typeof CursorRunSchema>;
