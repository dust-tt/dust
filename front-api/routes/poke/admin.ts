import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { AdminResponseType } from "@app/types/connectors/admin/cli";
import { AdminCommandSchema } from "@app/types/connectors/admin/cli";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { pokeApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

// Mounted at /api/poke/admin. pokeAuth is applied by the parent poke sub-app.
//
// The request body uses `AdminCommandSchema`, a large shared io-ts union
// (~880 lines) consumed by the connectors API type system. Migrating it to
// zod is outside the scope of this PR; we keep io-ts decoding inline here.
const app = pokeApp();

app.post("/", async (ctx): HandlerResult<AdminResponseType> => {
  const body = await ctx.req.json().catch(() => null);
  const bodyValidation = AdminCommandSchema.decode(body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `The request body is invalid: ${pathError}`,
      },
    });
  }
  const adminCommand = bodyValidation.right;
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const result = await connectorsAPI.admin(adminCommand);
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        connectors_error: result.error,
        message: "Error from connectors API.",
      },
    });
  }

  return ctx.json(result.value);
});

export default app;
