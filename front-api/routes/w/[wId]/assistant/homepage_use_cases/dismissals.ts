import { dismissHomepageUseCase } from "@app/lib/api/homepage_use_cases";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostDismissalBodySchema = z.object({
  useCaseId: z.string(),
});

const app = workspaceApp();

/** @ignoreswagger */
app.post("/", validate("json", PostDismissalBodySchema), async (ctx) => {
  const { useCaseId } = ctx.req.valid("json");

  const result = await dismissHomepageUseCase(ctx.get("auth"), useCaseId);
  if (result.isErr()) {
    switch (result.error.type) {
      case "use_case_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: `Unknown use case: ${useCaseId}.`,
          },
        });
      case "use_case_not_dismissible":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The use case ${useCaseId} cannot be dismissed.`,
          },
        });
      default:
        assertNever(result.error.type);
    }
  }

  return ctx.body(null, 204);
});

export default app;
