import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Hono } from "hono";

export type SessionCtx = {
  Variables: {
    session: SessionWithUser;
  };
};

export type WorkspaceAwareCtx = SessionCtx & {
  Variables: {
    auth: Authenticator;
  };
};

export type PokeCtx = SessionCtx & {
  Variables: {
    auth: Authenticator;
  };
};

export type PublicApiCtx = {
  Variables: {
    auth: Authenticator;
  };
};

export type SpaceCtx = WorkspaceAwareCtx & {
  Variables: {
    space: SpaceResource;
  };
};

export type DataSourceCtx = SpaceCtx & {
  Variables: {
    dataSource: DataSourceResource;
  };
};

export type DataSourceViewCtx = SpaceCtx & {
  Variables: {
    dataSourceView: DataSourceViewResource;
  };
};

export type SkillCtx = WorkspaceAwareCtx & {
  Variables: {
    skill: SkillResource;
  };
};

export const unauthedApp = () => new Hono();
export const sessionApp = () => new Hono<SessionCtx>();
export const workspaceApp = () => new Hono<WorkspaceAwareCtx>();
export const pokeApp = () => new Hono<PokeCtx>();
export const publicApiApp = () => new Hono<PublicApiCtx>();
export const skillApp = () => new Hono<SkillCtx>();
