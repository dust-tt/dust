import type { UserType } from "./user";

export type SkillStatus = "active" | "archived";
export type SkillScope = "private" | "workspace";

export type SkillConfigurationType = {
  sId: string;
  id: number;
  createdAt: Date;
  updatedAt: Date;
  workspaceId: number;
  version: number;
  status: SkillStatus;
  scope: SkillScope;
  name: string;
  description: string;
  instructions: string;
  authorId: number;
  requestedSpaceIds: number[];
};

export type SkillConfigurationWithAuthorType = Omit<
  SkillConfigurationType,
  "authorId"
> & {
  author: Omit<UserType, "lastLoginAt" | "provider">;
};
