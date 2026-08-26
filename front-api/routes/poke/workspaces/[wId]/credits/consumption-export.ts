import { buildMemberConsumptionExportZip } from "@app/lib/api/credits/consumption_export";
import { UserResource } from "@app/lib/resources/user_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  userId: z.string().min(1),
});

// Mounted at /api/poke/workspaces/:wId/credits/consumption-export.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { userId } = ctx.req.valid("query");

  const user = await UserResource.fetchById(userId);
  if (!user) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message:
          "The user you're trying to export consumption for was not found.",
      },
    });
  }

  const result = await buildMemberConsumptionExportZip(auth, { user });
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: result.error.message,
      },
    });
  }

  const { zip, filename } = result.value;

  // Raw Response, matching the pod app export route: the body is binary, not JSON.
  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

export default app;
