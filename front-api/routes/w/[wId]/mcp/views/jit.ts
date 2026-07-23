import type { GetMCPServerViewsListResponseBody } from "@app/lib/api/mcp";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const GetJITMCPViewsRequestSchema = z.object({
  spaceIds: z.array(z.string()),
});

// Mounted at /api/w/:wId/mcp/views/jit. Lists the views whose tools can be enabled directly in
// a conversation (JIT), in a light serialization without tool input schemas, authorization or
// remote server specifics. This feeds always-mounted surfaces (conversation capabilities
// picker, slash menu), which is why it is a separate endpoint from the full listing.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetMCPServerViewsListResponseBody> => {
  const auth = ctx.get("auth");
  const spaceIds = ctx.req.query("spaceIds");

  if (!spaceIds) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters",
      },
    });
  }

  const queryValidation = GetJITMCPViewsRequestSchema.safeParse({
    spaceIds: spaceIds.split(","),
  });
  if (!queryValidation.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(queryValidation.error).toString(),
      },
    });
  }

  // The JIT filter relies on the precomputed `cachedToolsRequireConfiguration` flag and the
  // light serialization ships no remote tools, so no heavy attribute is fetched.
  const views = await MCPServerViewResource.listBySpaceIdsEnsuringAutoViews(
    auth,
    queryValidation.data.spaceIds
  );

  const serverViews = views
    .filter((v) => v.isJITAttachable())
    .map((v) => v.toJSONLight())
    // Same availabilities as the full listing exposes: "auto_hidden_builder" is never served.
    .filter(
      (v) =>
        v.server.availability === "manual" || v.server.availability === "auto"
    );

  return ctx.json({ success: true, serverViews });
});

export default app;
