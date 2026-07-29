import type {
  GetActivationRecommendationsResponseBody,
  UpdateActivationRecommendationResponseBody,
} from "@app/lib/api/activation/recommendations";
import {
  listActivationRecommendationsForUser,
  updateActivationRecommendationForUser,
} from "@app/lib/api/activation/recommendations";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const UpdateRecommendationBodySchema = z.object({
  status: z.enum(["executed", "dismissed"]).optional(),
});

const ListRecommendationsQuerySchema = z.object({
  podId: z.string().optional(),
});

// Mounted at /api/w/:wId/action-recommendations.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", ListRecommendationsQuerySchema),
  async (ctx): HandlerResult<GetActivationRecommendationsResponseBody> => {
    const auth = ctx.get("auth");
    const { podId } = ctx.req.valid("query");

    const recommendations = await listActivationRecommendationsForUser(auth, {
      podId,
    });

    return ctx.json({ recommendations });
  }
);

/** @ignoreswagger */
app.patch(
  "/:recommendationId",
  validate("json", UpdateRecommendationBodySchema),
  async (ctx): HandlerResult<UpdateActivationRecommendationResponseBody> => {
    const auth = ctx.get("auth");
    const recommendationId = ctx.req.param("recommendationId");
    const { status } = ctx.req.valid("json");

    const result = await updateActivationRecommendationForUser(auth, {
      recommendationId,
      status,
    });

    if (result === "not_found") {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "recommendation_not_found",
          message: "Recommendation not found.",
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
