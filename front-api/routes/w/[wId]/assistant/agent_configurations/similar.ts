import { getSimilarAgents } from "@app/lib/api/assistant/existing_agent_checker";
import logger from "@app/logger/logger";
import type { GetSimilarAgentsResponseBody } from "@app/types/api/assistant/configuration/existing_agent_checker";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/assistant/agent_configurations/similar.
const app = workspaceApp();

/** @ignoreswagger */
app.post("/", async (ctx): HandlerResult<GetSimilarAgentsResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  const body = await ctx.req.json().catch(() => null);
  const bodySchema = z.object({ naturalDescription: z.string() });
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(parsed.error).toString(),
      },
    });
  }
  const { naturalDescription } = parsed.data;
  const naturalDescription = body?.naturalDescription;

  if (!isString(naturalDescription)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "naturalDescription is required and must be a string.",
      },
    });
  }

  const result = await getSimilarAgents(auth, { naturalDescription });

  if (result.isErr()) {
    logger.error(
      { error: result.error, workspaceId: owner.sId },
      "Error fetching similar agents"
    );
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: result.error.message,
      },
    });
  }
  const similarAgents = result.value.similar_agents;
  if (similarAgents.length > 0) {
    logger.info(
      {
        workspaceId: owner.sId,
        naturalDescription,
        similarAgents,
      },
      `Successfully fetched ${similarAgents.length} similar agents`
    );
  } else {
    logger.info(
      {
        workspaceId: owner.sId,
        naturalDescription,
      },
      "No similar agents found"
    );
  }

  return ctx.json(result.value);
});

export default app;
