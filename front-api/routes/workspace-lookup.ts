import { fetchRevokedWorkspace } from "@app/lib/api/user";
import { getUserFromSession } from "@app/lib/iam/session";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { LightWorkspaceType } from "@app/types/user";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";
import { z } from "zod";

import { sessionAuth } from "../middleware/session_auth";
import { validate } from "../middleware/validator";

export type GetWorkspaceLookupResponseBody = {
  workspace: LightWorkspaceType;
  status: "auto-join-disabled" | "revoked";
  workspaceVerifiedDomain: string | null;
};

const GetWorkspaceLookupQuerySchema = z.object({
  flow: z.enum(["no-auto-join", "revoked"]),
});

export const workspaceLookupApp = new Hono();

workspaceLookupApp.use("*", sessionAuth);

workspaceLookupApp.get(
  "/",
  validate("query", GetWorkspaceLookupQuerySchema),
  async (ctx): HandlerResult<GetWorkspaceLookupResponseBody> => {
    const session = ctx.get("session");

    const user = await getUserFromSession(session);
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "user_not_found", message: "User not found." },
      });
    }

    const { flow } = ctx.req.valid("query");

    if (flow === "no-auto-join") {
      const [, userEmailDomain] = user.email.split("@");
      const result =
        await WorkspaceResource.fetchByDomainWithInfo(userEmailDomain);
      const workspace = result?.workspace ?? null;
      const workspaceVerifiedDomain = result?.domainInfo.domain ?? null;

      if (!workspace || !workspaceVerifiedDomain) {
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "Workspace not found.",
          },
        });
      }

      return ctx.json({
        workspace: renderLightWorkspaceType({ workspace }),
        status: "auto-join-disabled" as const,
        workspaceVerifiedDomain,
      });
    }

    const result = await fetchRevokedWorkspace(user);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "Workspace not found.",
        },
      });
    }

    return ctx.json({
      workspace: renderLightWorkspaceType({ workspace: result.value }),
      status: "revoked" as const,
      workspaceVerifiedDomain: null,
    });
  }
);
