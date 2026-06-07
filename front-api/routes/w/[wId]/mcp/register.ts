import {
  MCPServerInstanceLimitError,
  registerMCPServer,
} from "@app/lib/api/actions/mcp/client_side_registry";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const MIN_SERVER_NAME_LENGTH = 5;
const MAX_SERVER_NAME_LENGTH = 30;
export const ClientSideMCPServerNameSchema = z
  .string()
  .refine(
    (s) =>
      s.trim().length >= MIN_SERVER_NAME_LENGTH &&
      s.trim().length <= MAX_SERVER_NAME_LENGTH
  );

const PostMCPRegisterRequestBodySchema = z.object({
  serverName: ClientSideMCPServerNameSchema,
});

export type PostMCPRegisterRequestBody = z.infer<
  typeof PostMCPRegisterRequestBodySchema
>;

// Mounted at /api/w/:wId/mcp/register.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostMCPRegisterRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { serverName } = ctx.req.valid("json");

    const registration = await registerMCPServer(auth, {
      serverName,
      workspaceId: auth.getNonNullableWorkspace().sId,
    });

    if (registration.isErr()) {
      const error = registration.error;
      if (error instanceof MCPServerInstanceLimitError) {
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "invalid_request_error", message: error.message },
        });
      }
      return apiError(ctx, {
        status_code: 500,
        api_error: { type: "internal_server_error", message: error.message },
      });
    }

    return ctx.json(registration.value);
  }
);

export default app;
