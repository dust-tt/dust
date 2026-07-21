import type { PokeListProjectPodFunctions } from "@app/lib/api/poke/projects";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  projectId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/pod-functions.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeListProjectPodFunctions> => {
    const auth = ctx.get("auth");
    const { projectId } = ctx.req.valid("param");

    const space = await SpaceResource.fetchById(auth, projectId);
    if (!space || !space.isProject()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Project not found.",
        },
      });
    }

    const sandboxFunctions = await SandboxFunctionResource.listBySpace(
      auth,
      space
    );
    const items = sandboxFunctions.map((sandboxFunction) => ({
      sId: sandboxFunction.sId,
      slug: sandboxFunction.slug,
      description: sandboxFunction.description,
    }));

    return ctx.json({ items });
  }
);

export default app;
