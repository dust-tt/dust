// Contract types and schemas for the user profile API endpoints:
// - GET /api/w/:wId/members/:uId/profile
// - PATCH /api/w/:wId/me/profile
// - GET /api/w/:wId/me/agent-memories
import { z } from "zod";

export const MAX_PRONOUNS_LENGTH = 32;
export const MAX_JOB_TITLE_LENGTH = 100;

export type UserProfileGroupType = {
  sId: string;
  name: string;
};

export type UserProfileType = {
  pronouns: string | null;
  jobTitle: string | null;
  // True when the job title comes from the workspace's identity provider (SCIM directory sync or
  // SSO). It is then read-only for the user.
  isJobTitleManaged: boolean;
  groups: UserProfileGroupType[];
};

export type GetUserProfileResponseBody = {
  profile: UserProfileType;
};

export const PatchMyProfileBodySchema = z.object({
  pronouns: z.string().trim().max(MAX_PRONOUNS_LENGTH).nullable(),
  // Omitted when the job title is managed by the identity provider.
  jobTitle: z.string().trim().max(MAX_JOB_TITLE_LENGTH).nullable().optional(),
});
export type PatchMyProfileBody = z.infer<typeof PatchMyProfileBodySchema>;

export type PatchMyProfileResponseBody = {
  profile: UserProfileType;
};

// One entry per agent holding at least one memory about the current user. Dates are ISO strings
// on the wire.
export type AgentMemorySummaryType = {
  agent: {
    sId: string;
    name: string;
    pictureUrl: string;
  };
  memoriesCount: number;
  lastUpdated: string;
  latestContent: string;
};

export type GetMyAgentMemoriesResponseBody = {
  agentMemories: AgentMemorySummaryType[];
};
