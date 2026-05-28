import { getMembers } from "@app/lib/api/workspace";
import type { ListMemberEmailsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  activeOnly: z.string().optional(),
});

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

// Mounted at /api/v1/w/:wId/members/emails.
const app = publicApiApp();

app.use("*", ensureIsSystemKey());

app.get(
  "/",
  validate("query", QuerySchema),
  async (ctx): HandlerResult<ListMemberEmailsResponseType> => {
    const auth = ctx.get("auth");
    const { activeOnly } = ctx.req.valid("query");

    const { members: allMembers } = await getMembers(auth, {
      activeOnly: !!activeOnly,
    });

    return ctx.json({ emails: allMembers.map((m) => m.email) });
  }
);

export default app;
