import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { z } from "zod";

import { fetchRevokedWorkspace } from "@app/lib/api/user";
import { getUserFromSession } from "@app/lib/iam/session";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

import { sessionAuth } from "../middleware/session_auth";
import { validate } from "../middleware/validator";

const GetWorkspaceLookupQuerySchema = z.object({
  flow: z.enum(["no-auto-join", "revoked"]),
});

export const workspaceLookupApp = new Hono();

workspaceLookupApp.use("*", sessionAuth);

workspaceLookupApp.get(
  "/",
  validate("query", GetWorkspaceLookupQuerySchema),
  async (c) => {
    const session = c.get("session");

    const user = await getUserFromSession(session);
    if (!user) {
      return apiError(c, {
        status_code: 404,
        api_error: { type: "user_not_found", message: "User not found." },
      });
    }

    const { flow } = c.req.valid("query");

    if (flow === "no-auto-join") {
      const [, userEmailDomain] = user.email.split("@");
      const result =
        await WorkspaceResource.fetchByDomainWithInfo(userEmailDomain);
      const workspace = result?.workspace ?? null;
      const workspaceVerifiedDomain = result?.domainInfo.domain ?? null;

      if (!workspace || !workspaceVerifiedDomain) {
        return apiError(c, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "Workspace not found.",
          },
        });
      }

      return c.json({
        workspace: renderLightWorkspaceType({ workspace }),
        status: "auto-join-disabled" as const,
        workspaceVerifiedDomain,
      });
    }

    const result = await fetchRevokedWorkspace(user);
    if (result.isErr()) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "Workspace not found.",
        },
      });
    }

    return c.json({
      workspace: renderLightWorkspaceType({ workspace: result.value }),
      status: "revoked" as const,
      workspaceVerifiedDomain: null,
    });
  }
);
