import { getUserFromSession } from "@app/lib/iam/session";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { Op } from "sequelize";
import { z } from "zod";

const PostUserMetadataBodySchema = z.object({
  value: z.string(),
});

// Mounted at /api/user/metadata/:key. sessionAuth is applied by the parent
// `/api/user` sub-app.
const app = new Hono();

async function loadUserAndWorkspace(ctx: Context) {
  const session = ctx.get("session");
  const user = await getUserFromSession(session);
  if (!user) {
    return {
      err: apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found" as const,
          message: "The user was not found.",
        },
      }),
    };
  }

  // We get the UserResource from the session userId. Temporary, as we'd need
  // to refactor getUserFromSession to return the UserResource directly.
  const u = await UserResource.fetchByModelId(user.id);
  if (!u) {
    return {
      err: apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found" as const,
          message: "Could not find the user.",
        },
      }),
    };
  }

  const wIdQuery = ctx.req.query("workspaceId");
  let workspaceModelId: number | undefined;
  if (wIdQuery) {
    const ws = user.workspaces.find((w) => w.sId === wIdQuery);
    if (ws) {
      workspaceModelId = ws.id;
    }
  }

  return { u, workspaceModelId };
}

app.get("/", async (ctx) => {
  const r = await loadUserAndWorkspace(ctx);
  if ("err" in r) {
    return r.err;
  }

  const key = ctx.req.param("key") ?? "";
  const metadata = await r.u.getMetadata(key, r.workspaceModelId);
  return ctx.json({ metadata });
});

app.post("/", validate("json", PostUserMetadataBodySchema), async (ctx) => {
  const r = await loadUserAndWorkspace(ctx);
  if ("err" in r) {
    return r.err;
  }

  const key = ctx.req.param("key") ?? "";
  const { value } = ctx.req.valid("json");
  await r.u.setMetadata(key, value, r.workspaceModelId);
  return ctx.json({ metadata: { key, value } });
});

app.delete("/", async (ctx) => {
  const r = await loadUserAndWorkspace(ctx);
  if ("err" in r) {
    return r.err;
  }

  const key = ctx.req.param("key") ?? "";
  await r.u.deleteMetadata({
    key: {
      [Op.like]: `${key}%`,
    },
  });
  return ctx.body(null, 200);
});

export default app;
