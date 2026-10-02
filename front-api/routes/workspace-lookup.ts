import { fetchRevokedWorkspace } from "@app/lib/api/user";
import type { GetWorkspaceLookupResponseBody } from "@app/lib/api/workspace";
import { getUserFromSession } from "@app/lib/iam/session";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { sessionApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { z } from "zod";

import { sessionAuth } from "../middlewares/session_auth";
import { validate } from "../middlewares/validator";

const GetWorkspaceLookupQuerySchema = z.object({
  flow: z.enum(["no-auto-join", "revoked"]),
});

/**
 * @cc [owner:tdraier,label:security] non-member-workspace-name-only
 * The caller is not necessarily a member of the looked-up workspace (`no-auto-join` resolves it from
 * the caller's e-mail domain alone). The response MUST NOT expose any workspace field other than its
 * `name`: no identifiers (sId, WorkOS organization, Metronome customer), metadata, plan or settings.
 */
export const workspaceLookupApp = sessionApp();

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
        workspace: { name: workspace.name },
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
      workspace: { name: result.value.name },
      status: "revoked" as const,
      workspaceVerifiedDomain: null,
    });
  }
);
