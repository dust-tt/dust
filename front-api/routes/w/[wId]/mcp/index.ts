import {
  type GetMCPServersResponseBody,
  getMCPServerViewNameConflictMessage,
  isMCPServerViewNameConflict,
} from "@app/lib/api/mcp";
import {
  createInternalMCPServer,
  createRemoteMCPServer,
  listMCPServersWithViews,
} from "@app/lib/api/mcp/servers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import server from "./[serverId]";
import available from "./available";
import connections from "./connections";
import deregister from "./deregister";
import discoverOAuthMetadata from "./discover_oauth_metadata";
import heartbeat from "./heartbeat";
import register from "./register";
import requestAccess from "./request_access";
import requests from "./requests";
import results from "./results";
import usage from "./usage";
import views from "./views";

const CustomHeadersSchema = z
  .array(z.object({ key: z.string(), value: z.string() }))
  .optional();

const UseCaseSchema = z
  .enum(["platform_actions", "personal_actions"])
  .optional();

const PostBodySchema = z.discriminatedUnion("serverType", [
  z.object({
    serverType: z.literal("remote"),
    url: z.string(),
    defaultServerId: z.number().optional(),
    includeGlobal: z.boolean().optional(),
    sharedSecret: z.string().optional(),
    useCase: UseCaseSchema,
    connectionId: z.string().optional(),
    customHeaders: CustomHeadersSchema,
    viewName: z.string().optional(),
  }),
  z.object({
    serverType: z.literal("internal"),
    name: z.string(),
    useCase: UseCaseSchema,
    connectionId: z.string().optional(),
    includeGlobal: z.boolean().optional(),
    sharedSecret: z.string().optional(),
    customHeaders: CustomHeadersSchema,
    viewName: z.string().optional(),
    oauthScope: z.string().optional(),
  }),
]);

// Mounted at /api/w/:wId/mcp. workspaceAuth is applied by the parent
// workspace sub-app.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetMCPServersResponseBody> => {
  const auth = ctx.get("auth");
  const servers = await listMCPServersWithViews(auth);
  return ctx.json({ success: true, servers });
});

app.post("/", validate("json", PostBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const body = ctx.req.valid("json");

  const result =
    body.serverType === "remote"
      ? await createRemoteMCPServer(auth, body)
      : await createInternalMCPServer(auth, body);

  if (result.isErr()) {
    if (isMCPServerViewNameConflict(result.error)) {
      const { nameConflict, conflictDetails } = result.error;
      return ctx.json(
        {
          error: {
            type: "mcp_server_view_already_exists",
            message: getMCPServerViewNameConflictMessage(result.error),
          },
          nameConflict: {
            name: nameConflict,
            ...(conflictDetails ? { conflictDetails } : {}),
          },
        },
        400
      );
    }

    const { code, message } = result.error;
    switch (code) {
      case "remote_server_error":
        // Non-standard envelope: callers rely on the `isRemoteServerError` flag.
        return ctx.json(
          {
            error: { type: "remote_mcp_server_connection_failed", message },
            isRemoteServerError: true,
          },
          400
        );
      case "missing_url":
      case "invalid_internal_server_name":
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "invalid_request_error", message },
        });
      case "url_too_long":
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "mcp_server_url_too_long", message },
        });
      case "invalid_url":
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "invalid_mcp_server_url", message },
        });
      case "invalid_name":
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "mcp_server_name_invalid", message },
        });
      case "oauth_connection_error":
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "mcp_oauth_connection_error", message },
        });
      case "server_not_available":
        return apiError(ctx, {
          status_code: 403,
          api_error: { type: "mcp_server_not_available", message },
        });
      case "server_already_installed":
        return apiError(ctx, {
          status_code: 409,
          api_error: { type: "mcp_server_already_installed", message },
        });
      case "system_view_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: { type: "mcp_server_view_not_found", message },
        });
      default:
        return assertNever(code);
    }
  }

  return ctx.json({ success: true, server: result.value }, 201);
});

app.route("/available", available);
app.route("/connections", connections);
app.route("/deregister", deregister);
app.route("/discover_oauth_metadata", discoverOAuthMetadata);
app.route("/heartbeat", heartbeat);
app.route("/register", register);
app.route("/request_access", requestAccess);
app.route("/requests", requests);
app.route("/results", results);
app.route("/usage", usage);
app.route("/views", views);

// Per-server operations: mounted at /:serverId so child routes can read it.
app.route("/:serverId", server);

export default app;
