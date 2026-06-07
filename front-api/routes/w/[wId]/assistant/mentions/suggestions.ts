import { suggestionsOfMentions } from "@app/lib/api/assistant/conversation/mention_suggestions";
import { workspaceApp } from "@front-api/middlewares/ctx";

// Mounted at /api/w/:wId/assistant/mentions/suggestions.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/mentions/suggestions:
 *   get:
 *     summary: Get mention suggestions
 *     description: Returns mention suggestions for the workspace.
 *     tags:
 *       - Private Mentions
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: query
 *         required: false
 *         description: Search query to filter suggestions
 *         schema:
 *           type: string
 *       - in: query
 *         name: select
 *         required: false
 *         description: Filter by type (agents, users, or both)
 *         schema:
 *           type: string
 *           enum: [agents, users]
 *       - in: query
 *         name: current
 *         required: false
 *         description: Whether to include only current mentions
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *       - in: query
 *         name: spaceId
 *         required: false
 *         description: Filter suggestions by space
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateMentionSuggestion'
 *       401:
 *         description: Unauthorized
 */

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const query = ctx.req.query("query")?.trim().toLowerCase() ?? "";
  const current = ctx.req.query("current") === "true";
  const spaceId = ctx.req.query("spaceId");

  // `select` may appear multiple times in the query string. Default to both
  // agents and users when absent.
  const selectValues = ctx.req.queries("select");
  const select = !selectValues
    ? { agents: true, users: true }
    : {
        agents: selectValues.includes("agents"),
        users: selectValues.includes("users"),
      };

  const suggestions = await suggestionsOfMentions(auth, {
    query,
    select,
    current,
    spaceId,
  });

  return ctx.json({ suggestions });
});

export default app;
