import {
  type GetGoTemplateDraftResponseBody,
  type GoTemplateError,
  resolveGoTemplateDraft,
} from "@app/lib/api/assistant/go_template";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

function getGoTemplateApiError(
  error: GoTemplateError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "template_not_found":
      return {
        status_code: 404,
        api_error: {
          type: "template_not_found",
          message: `Template "${error.slug}" was not found.`,
        },
      };
    case "contentful_fetch_failed":
      return {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to load template.",
        },
      };
    default:
      assertNever(error);
  }
}

// Mounted at /api/w/:wId/assistant/go-template.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/go-template:
 *   get:
 *     summary: Resolve a conversation go template draft
 *     description: Fetches a Contentful conversation go template by slug and returns a composer-ready draft with optional pre-uploaded attachments.
 *     tags:
 *       - Private Assistant
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: slug
 *         required: true
 *         description: Contentful template slug
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Composer draft resolved from the template
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GetGoTemplateDraftResponseBody'
 *       404:
 *         description: Template not found or disabled
 *       422:
 *         description: Missing slug query parameter
 */
app.get("/", async (ctx): HandlerResult<GetGoTemplateDraftResponseBody> => {
  const auth = ctx.get("auth");
  const slug = ctx.req.query("slug");

  if (!isString(slug) || slug.trim() === "") {
    return apiError(ctx, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: "The slug query parameter is invalid or missing.",
      },
    });
  }

  const result = await resolveGoTemplateDraft(auth, slug);
  if (result.isErr()) {
    return apiError(ctx, getGoTemplateApiError(result.error));
  }

  return ctx.json(result.value);
});

export default app;
