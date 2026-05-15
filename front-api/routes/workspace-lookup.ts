import { Hono } from "hono";
import { z } from "zod";

import {
  fetchRevokedWorkspace,
  getUserWithWorkspaces,
} from "@app/lib/api/user";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

import { validate } from "../middleware/validator";

const GetWorkspaceLookupQuerySchema = z.object({
  flow: z.enum(["no-auto-join", "revoked"]),
});

export const workspaceLookupApp = new Hono();

workspaceLookupApp.get(
  "/",
  validate("query", GetWorkspaceLookupQuerySchema),
  async (c) => {
    const userResource = c.get("userResource");
    const { flow } = c.req.valid("query");

    if (flow === "no-auto-join") {
      const [, userEmailDomain] = userResource.email.split("@");
      const result =
        await WorkspaceResource.fetchByDomainWithInfo(userEmailDomain);
      const workspace = result?.workspace ?? null;
      const workspaceVerifiedDomain = result?.domainInfo.domain ?? null;

      if (!workspace || !workspaceVerifiedDomain) {
        return c.json(
          {
            error: {
              type: "workspace_not_found",
              message: "Workspace not found.",
            },
          },
          404
        );
      }

      return c.json({
        workspace: renderLightWorkspaceType({ workspace }),
        status: "auto-join-disabled" as const,
        workspaceVerifiedDomain,
      });
    }

    const user = await getUserWithWorkspaces(userResource);
    const result = await fetchRevokedWorkspace(user);
    if (result.isErr()) {
      return c.json(
        {
          error: {
            type: "workspace_not_found",
            message: "Workspace not found.",
          },
        },
        404
      );
    }

    return c.json({
      workspace: renderLightWorkspaceType({ workspace: result.value }),
      status: "revoked" as const,
      workspaceVerifiedDomain: null,
    });
  }
);
