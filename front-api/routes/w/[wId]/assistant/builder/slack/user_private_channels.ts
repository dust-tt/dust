import { listUserPrivateSlackChannels } from "@app/lib/api/assistant/builder/slack/user_private_channels";
import type { GetSlackUserPrivateChannelsResponseBody } from "@app/types/api/assistant/builder/slack/user_private_channels";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetSlackUserPrivateChannelsResponseBody> => {
    const auth = ctx.get("auth");

    const result = await listUserPrivateSlackChannels(auth);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;
