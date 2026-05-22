import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Hono } from "hono";

export type SessionAuthEnv = {
  Variables: {
    session: SessionWithUser;
  };
};

export type WorkspaceAuthEnv = {
  Variables: {
    auth: Authenticator;
    session: SessionWithUser;
  };
};

export type PokeAuthEnv = {
  Variables: {
    auth: Authenticator;
    session: SessionWithUser;
  };
};

export type PokeWorkspaceAuthEnv = {
  Variables: {
    auth: Authenticator;
  };
};

export type PublicApiAuthEnv = {
  Variables: {
    auth: Authenticator;
  };
};

export type SpaceEnv = {
  Variables: {
    space: SpaceResource;
  };
};

export type DataSourceEnv = {
  Variables: {
    dataSource: DataSourceResource;
  };
};

export type DataSourceViewEnv = {
  Variables: {
    dataSourceView: DataSourceViewResource;
  };
};

export type SkillEnv = {
  Variables: {
    skill: SkillResource;
  };
};

export type WorkspaceAuthWithSkillEnv = WorkspaceAuthEnv & SkillEnv;

export const unauthedApp = () => new Hono();
export const sessionAuthApp = () => new Hono<SessionAuthEnv>();
export const workspaceApp = () => new Hono<WorkspaceAuthEnv>();
export const pokeApp = () => new Hono<PokeAuthEnv>();
export const pokeWorkspaceApp = () => new Hono<PokeWorkspaceAuthEnv>();
export const publicApiApp = () => new Hono<PublicApiAuthEnv>();
export const workspaceAuthWithSkillApp = () =>
  new Hono<WorkspaceAuthWithSkillEnv>();
