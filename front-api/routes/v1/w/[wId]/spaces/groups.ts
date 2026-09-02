import { listSpaceMemberGroupIds } from "@app/lib/api/spaces";
import type { GetSpaceGroupIdsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { GetSpaceGroupIdsResponseType } from "@dust-tt/client";

const GetSpaceGroupIdsQuerySchema = z.object({
  spaceIds: z
    .string()
    .transform((value) => value.split(","))
    .pipe(z.array(z.string().min(1)).min(1)),
});

// Mounted at /api/v1/w/:wId/spaces/groups.
const app = publicApiApp();

/**
 * @ignoreswagger
 * System-key-only internal endpoint, not part of the public API docs.
 */
app.get(
  "/",
  ensureIsSystemKey(),
  validate("query", GetSpaceGroupIdsQuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { spaceIds } = ctx.req.valid("query");

    const body: GetSpaceGroupIdsResponseType = {
      groupIds: await listSpaceMemberGroupIds(auth, { spaceIds }),
    };

    return ctx.json(body);
  }
);

export default app;
