import { Hono } from "hono";
import { z } from "zod";

import { isRemoteMCPServerError } from "@app/lib/actions/mcp_errors";
import type { MCPServerType, MCPServerTypeWithViews } from "@app/lib/api/mcp";
import {
  createInternalMCPServer,
  createRemoteMCPServer,
  listMCPServersWithViews,
} from "@app/lib/api/mcp/servers";

import { validate } from "@front-api/middleware/validator";

import server from "./[serverId]";
import available from "./available";
import connections from "./connections";
import deregister from "./deregister";
import discoverOAuthMetadata from "./discover_oauth_metadata";
import heartbeat from "./heartbeat";
import register from "./register";
import requestAccess from "./request_access";
import usage from "./usage";
import views from "./views";

export type GetMCPServersResponseBody = {
  success: true;
  servers: MCPServerTypeWithViews[];
};

export type CreateMCPServerResponseBody = {
  success: true;
  server: MCPServerType;
};

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
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const servers = await listMCPServersWithViews(auth);
  return c.json({ success: true, servers });
});

app.post("/", validate("json", PostBodySchema), async (c) => {
  const auth = c.get("auth");
  const body = c.req.valid("json");

  const result =
    body.serverType === "remote"
      ? await createRemoteMCPServer(auth, body)
      : await createInternalMCPServer(auth, body);

  if (result.isErr()) {
    const message = result.error.message;
    if (isRemoteMCPServerError(result.error)) {
      // Non-standard envelope: callers rely on the `isRemoteServerError` flag.
      return c.json(
        {
          error: { type: "invalid_request_error", message },
          isRemoteServerError: true,
        },
        400
      );
    }
    return c.json({ error: { type: "invalid_request_error", message } }, 400);
  }

  return c.json({ success: true, server: result.value }, 201);
});

app.route("/available", available);
app.route("/connections", connections);
app.route("/deregister", deregister);
app.route("/discover_oauth_metadata", discoverOAuthMetadata);
app.route("/heartbeat", heartbeat);
app.route("/register", register);
app.route("/request_access", requestAccess);
app.route("/usage", usage);
app.route("/views", views);

// Per-server operations: mounted at /:serverId so child routes can read it.
app.route("/:serverId", server);

export default app;
