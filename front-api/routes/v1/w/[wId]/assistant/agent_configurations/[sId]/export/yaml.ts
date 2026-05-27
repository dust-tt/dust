import { exportAgentConfigurationAsYAML } from "@app/lib/api/assistant/configuration/yaml_export";
import logger from "@app/logger/logger";
import type { APIErrorResponse } from "@app/types/error";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import type { TypedResponse } from "hono";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/{sId}/export/yaml:
 *   get:
 *     summary: Export agent configuration as YAML
 *     description: Download the agent configuration identified by {sId} as a YAML file.
 *     tags:
 *       - Agents
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: sId
 *         required: true
 *         description: ID of the agent configuration
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The agent configuration as a downloadable YAML file
 *         content:
 *           text/yaml:
 *             schema:
 *               type: string
 *         headers:
 *           Content-Disposition:
 *             description: Attachment with suggested filename
 *             schema:
 *               type: string
 *       400:
 *         description: Bad Request. Invalid or missing parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Agent configuration not found.
 *       500:
 *         description: Internal Server Error.
 */

// Mounted at /api/v1/w/:wId/assistant/agent_configurations/:sId/export/yaml.
const app = publicApiApp();

app.get(
  "/",
  async (
    ctx
  ): Promise<
    TypedResponse<string, 200, "body"> | TypedResponse<APIErrorResponse>
  > => {
    const auth = ctx.get("auth");
    const sId = ctx.req.param("sId") ?? "";
    const allParams = ctx.req.param();

    logger.info(
      { sId, allParams, url: ctx.req.url, path: ctx.req.path },
      "[v1] export/yaml handler hit"
    );

    const result = await exportAgentConfigurationAsYAML(auth, sId);

    if (result.isErr()) {
      return apiError(ctx, result.error);
    }

    const { yamlContent, filename } = result.value;

    ctx.header("Content-Type", "text/yaml; charset=utf-8");
    ctx.header("Content-Disposition", `attachment; filename="${filename}"`);
    return ctx.body(yamlContent, 200);
  }
);

export default app;
