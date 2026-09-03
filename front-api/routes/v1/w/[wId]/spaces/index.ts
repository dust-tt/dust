import { SpaceResource } from "@app/lib/resources/space_resource";
import type { EnrichedSpaceType } from "@app/types/space";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import spaceId from "./[spaceId]";
import groups from "./groups";

export type GetPublicSpacesResponseBody = {
  spaces: EnrichedSpaceType[];
};

// The kinds this endpoint returns when `kinds` is omitted.
const DEFAULT_SPACE_KINDS = ["system", "global", "regular"] as const;

// The kinds `kinds` can select. Projects are opt-in: they are noisy enough that
// listing them by default would change what every existing caller sees.
const SELECTABLE_SPACE_KINDS = [...DEFAULT_SPACE_KINDS, "project"] as const;

const GetSpacesQuerySchema = z.object({
  kinds: z
    .string()
    .optional()
    .transform((value) => value?.split(","))
    .pipe(z.array(z.enum(SELECTABLE_SPACE_KINDS)).optional()),
});

// Mounted at /api/v1/w/:wId/spaces. publicApiAuth is applied by the parent
// v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

app.route("/groups", groups);
app.route("/:spaceId", spaceId);

/**
 * @swagger
 * /api/v1/w/{wId}/spaces:
 *   get:
 *     summary: List available spaces.
 *     description: Retrieves a list of accessible spaces for the authenticated workspace.
 *     tags:
 *       - Spaces
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: kinds
 *         required: false
 *         description: Comma-separated list of space kinds to filter on, among `system`, `global`, `regular` and `project`. Defaults to `system,global,regular` — projects must be requested explicitly.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Spaces of the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spaces:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Space'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace not found.
 *       500:
 *         description: Internal Server Error.
 */

app.get(
  "/",
  validate("query", GetSpacesQuerySchema),
  async (ctx): HandlerResult<GetPublicSpacesResponseBody> => {
    const auth = ctx.get("auth");
    const { kinds } = ctx.req.valid("query");

    const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth, {
      kinds: kinds ?? [...DEFAULT_SPACE_KINDS],
    });

    return ctx.json({
      spaces: await SpaceResource.batchToJSONEnriched(auth, spaces),
    });
  }
);

export default app;
