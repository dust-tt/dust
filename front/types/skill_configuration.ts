import type { UserType } from "./user";

export type SkillStatus = "active" | "archived";
export type SkillScope = "private" | "workspace";

export type SkillConfiguration = {
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
  tools: { mcpServerViewId: string }[];
};

export type SkillConfigurationWithAuthor = Omit<
  SkillConfiguration,
  "authorId"
> & {
  author: Omit<UserType, "fullName" | "lastLoginAt" | "provider">;
};
